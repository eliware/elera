import { readStateFile } from './state-file.mjs';
import { recoverState } from './recovery.mjs';

export function createColdBootstrapEvidence({ localNode, dataDir, health, fetchImpl = fetch, token, timeoutMs = 2000, log = {}, read = undefined, run = undefined } = {}) {
  if (!localNode?.name || !dataDir || !health) throw new TypeError('cold bootstrap local evidence is required');
  const local = async () => {
    const state = await readStateFile(dataDir, { read });
    const recovered = state.seqno < 0 ? await recoverState(dataDir, { run }) : undefined;
    const status = await health.status().catch(() => ({ ready: false, values: {} }));
    return { node: localNode.name, state: recovered ? { ...state, ...recovered } : state, active: status.ready === true || status.values?.wsrep_local_state_comment === 'Synced' };
  };
  const remote = async (url) => {
    const response = await fetchImpl(`${url.replace(/\/$/, '')}/api/v1/cluster/cold-bootstrap/evidence`, { headers: { accept: 'application/json', authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`peer returned ${response.status}`);
    return (await response.json()).data;
  };
  return { local, remote, log };
}
