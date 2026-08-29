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
    const recovered = state.seqno < 0 ? await recoverState(dataDir, { run }) : undefined;
    const status = await health.status().catch(() => ({ ready: false, values: {} }));
    return { node: localNode.name, state: recovered ? { ...state, ...recovered, savedSeqno: state.seqno, recoveredSeqno: recovered.seqno } : { ...state, savedSeqno: state.seqno, recoveredSeqno: undefined }, dataDirectory: { valid: directory.action === 'start', reason: directory.reason }, active: status.ready === true || status.values?.wsrep_local_state_comment === 'Synced', galera: { clusterUuid: status.values?.wsrep_cluster_state_uuid, clusterStatus: status.values?.wsrep_cluster_status, localState: status.values?.wsrep_local_state_comment, ready: status.values?.wsrep_ready }, generation, observedAt: new Date().toISOString() };
  };
  const remote = async (url) => {
    const response = await fetchImpl(`${url.replace(/\/$/, '')}/api/v1/cluster/cold-bootstrap/evidence`, { headers: { accept: 'application/json', authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`peer returned ${response.status}`);
    return (await response.json()).data;
  };
  return { local, remote, log };
}
