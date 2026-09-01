import { readStateFile } from './state-file.mjs';
import { recoverState } from './recovery.mjs';
import { inspectDataDirectory } from '../../lifecycle/data-directory.mjs';

const isFqdn = (value) => typeof value === 'string' && value.includes('.') && value.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));

export function createColdBootstrapEvidence({ localNode, dataDir, health, fetchImpl = fetch, token, timeoutMs = 2000, log = {}, read = undefined, run = undefined } = {}) {
  if (!isFqdn(localNode?.name) || !dataDir || !health) throw new TypeError('cold bootstrap local evidence requires a FQDN identity');
  let generation = 0;
  let recoveryInFlight;
  let recoveredState;
  let recoveryFailure;
  const local = async () => {
    generation += 1;
    const directory = inspectDataDirectory(dataDir);
    const state = await readStateFile(dataDir, { read });
    const status = await health.status().catch(() => ({ ready: false, values: {} }));
    const active = status.ready === true && status.values?.wsrep_local_state_comment === 'Synced' && status.values?.wsrep_cluster_status === 'Primary' && status.values?.wsrep_ready === 'ON';
    let recovered;
    if (state.seqno < 0 && !active) {
      if (recoveryFailure) throw recoveryFailure;
      if (!recoveredState) {
        recoveryInFlight ??= recoverState(dataDir, { run }).then((value) => {
          recoveredState = value;
          return value;
        }).catch((error) => {
          recoveryFailure = error;
          throw error;
        }).finally(() => { recoveryInFlight = undefined; });
      }
      recovered = recoveredState ?? await recoveryInFlight;
    }
    const latest = await health.status().catch(() => undefined);
    const currentlyActive = latest?.ready === true && latest.values?.wsrep_local_state_comment === 'Synced' && latest.values?.wsrep_cluster_status === 'Primary' && latest.values?.wsrep_ready === 'ON';
    if (currentlyActive) return { node: localNode.name, state: { ...state, savedSeqno: state.seqno, recoveredSeqno: undefined }, dataDirectory: { valid: directory.action === 'start', reason: directory.reason }, active: true, galera: { clusterUuid: latest.values.wsrep_cluster_state_uuid, clusterStatus: latest.values.wsrep_cluster_status, localState: latest.values.wsrep_local_state_comment, ready: latest.values.wsrep_ready, clusterSize: Number(latest.values.wsrep_cluster_size) }, generation, observedAt: new Date().toISOString() };
    return { node: localNode.name, state: recovered ? { ...state, ...recovered, savedSeqno: state.seqno, recoveredSeqno: recovered.seqno } : { ...state, savedSeqno: state.seqno, recoveredSeqno: undefined }, dataDirectory: { valid: directory.action === 'start', reason: directory.reason }, active, galera: { clusterUuid: status.values?.wsrep_cluster_state_uuid, clusterStatus: status.values?.wsrep_cluster_status, localState: status.values?.wsrep_local_state_comment, ready: status.values?.wsrep_ready, clusterSize: Number(status.values?.wsrep_cluster_size) }, generation, observedAt: new Date().toISOString() };
  };
  const remote = async (url, expectedNode) => {
    if (typeof url !== 'string' || !url) throw Object.assign(new Error(`recovery evidence request requires a URL: expectedNode=${expectedNode ?? '<unknown>'}`), { code: 'RECOVERY_EVIDENCE_UNAVAILABLE', expectedNode });
    let peerUrl;
    try { peerUrl = new URL(url); } catch (error) { throw Object.assign(new Error(`recovery evidence request requires a valid URL: expectedNode=${expectedNode ?? '<unknown>'}; error=${error.message}`), { code: 'RECOVERY_EVIDENCE_UNAVAILABLE', expectedNode, cause: error }); }
    if (!isFqdn(peerUrl.hostname)) throw Object.assign(new Error(`recovery evidence request requires an FQDN URL: expectedNode=${expectedNode ?? '<unknown>'}; endpoint=${url}`), { code: 'RECOVERY_EVIDENCE_UNAVAILABLE', expectedNode });
    const endpoint = `${url.replace(/\/$/, '')}/api/v1/cluster/cold-bootstrap/evidence`;
    let response;
    try { response = await fetchImpl(endpoint, { headers: { accept: 'application/json', authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(timeoutMs) }); }
    catch (error) { throw Object.assign(new Error(`recovery evidence request failed: expectedNode=${expectedNode ?? '<unknown>'}; endpoint=${endpoint}; error=${error.message}`), { code: 'RECOVERY_EVIDENCE_UNAVAILABLE', endpoint, expectedNode, cause: error }); }
    if (!response.ok) throw Object.assign(new Error(`recovery evidence request failed: expectedNode=${expectedNode ?? '<unknown>'}; endpoint=${endpoint}; status=${response.status}`), { code: 'RECOVERY_EVIDENCE_UNAVAILABLE', endpoint, expectedNode, statusCode: response.status });
    let body;
    try { body = await response.json(); } catch (error) { throw Object.assign(new Error(`peer returned invalid recovery evidence JSON: expectedNode=${expectedNode ?? '<unknown>'}; endpoint=${endpoint}; error=${error.message}`), { code: 'INVALID_RECOVERY_EVIDENCE', endpoint, expectedNode, cause: error }); }
    const data = body?.data;
    if (!data || typeof data !== 'object' || typeof data.node !== 'string') throw Object.assign(new Error(`peer returned malformed recovery evidence: expectedNode=${expectedNode ?? '<unknown>'}; endpoint=${endpoint}; respondingNode=${data?.node ?? '<missing>'}`), { code: 'INVALID_RECOVERY_EVIDENCE', endpoint, expectedNode, actualNode: data?.node });
    if (expectedNode && data.node !== expectedNode) throw Object.assign(new Error(`peer evidence identity mismatch: expectedNode=${expectedNode}; respondingNode=${data.node}; endpoint=${endpoint}`), { code: 'RECOVERY_EVIDENCE_IDENTITY_MISMATCH', endpoint, expectedNode, actualNode: data.node, deterministic: true });
    return data;
  };
  return { local, remote, log };
}
