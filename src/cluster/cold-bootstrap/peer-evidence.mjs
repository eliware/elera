import { readStateFile } from './state-file.mjs';
import { recoverState } from './recovery.mjs';
import { inspectDataDirectory } from '../../lifecycle/data-directory.mjs';

export function createColdBootstrapEvidence({ localNode, dataDir, health, fetchImpl = fetch, token, timeoutMs = 2000, log = {}, read = undefined, run = undefined } = {}) {
  if (!localNode?.name || !dataDir || !health) throw new TypeError('cold bootstrap local evidence is required');
  let generation = 0;
  const local = async () => {
    generation += 1;
    const directory = inspectDataDirectory(dataDir);
    const state = await readStateFile(dataDir, { read });
    const status = await health.status().catch(() => ({ ready: false, values: {} }));
    const active = status.ready === true || status.values?.wsrep_local_state_comment === 'Synced';
    const recovered = state.seqno < 0 && !active ? await recoverState(dataDir, { run }) : undefined;
    return { node: localNode.name, state: recovered ? { ...state, ...recovered, savedSeqno: state.seqno, recoveredSeqno: recovered.seqno } : { ...state, savedSeqno: state.seqno, recoveredSeqno: undefined }, dataDirectory: { valid: directory.action === 'start', reason: directory.reason }, active, galera: { clusterUuid: status.values?.wsrep_cluster_state_uuid, clusterStatus: status.values?.wsrep_cluster_status, localState: status.values?.wsrep_local_state_comment, ready: status.values?.wsrep_ready, clusterSize: Number(status.values?.wsrep_cluster_size) }, generation, observedAt: new Date().toISOString() };
  };
  const remote = async (url, expectedNode) => {
    const endpoint = `${url.replace(/\/$/, '')}/api/v1/cluster/cold-bootstrap/evidence`;
    const response = await fetchImpl(endpoint, { headers: { accept: 'application/json', authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw Object.assign(new Error(`peer returned ${response.status}`), { code: 'RECOVERY_EVIDENCE_UNAVAILABLE', endpoint, statusCode: response.status });
    const body = await response.json();
    const data = body?.data;
    if (!data || typeof data !== 'object' || typeof data.node !== 'string') throw Object.assign(new Error('peer returned malformed recovery evidence'), { code: 'INVALID_RECOVERY_EVIDENCE', endpoint });
    if (expectedNode && data.node !== expectedNode) throw Object.assign(new Error(`peer evidence identity mismatch: expected ${expectedNode}, received ${data.node}`), { code: 'RECOVERY_EVIDENCE_IDENTITY_MISMATCH', endpoint, expectedNode, actualNode: data.node });
    return data;
  };
  return { local, remote, log };
}
