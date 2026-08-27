export function createDrainPropagation({ drain, peers = [], token, fetchImpl = fetch, log = {} } = {}) {
  if (!drain || typeof drain.begin !== 'function' || typeof drain.end !== 'function') throw new TypeError('drain manager is required');
  const targets = peers.filter(Boolean).map((peer) => peer.replace(/\/$/, ''));
  const propagate = (value) => Promise.all(targets.map(async (peer) => {
    try {
      const response = await fetchImpl(`${peer}/api/v1/traffic/${value ? 'drain' : 'undrain'}`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-elera-drain-propagated': 'true' },
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) throw new Error(`peer returned ${response.status}`);
      return { accepted: true };
    } catch (error) {
      log.warn?.('Cluster drain propagation failed', { peer, error });
      return { accepted: false, reason: 'unavailable' };
    }
  }));
  return {
    set(value, propagated = false) {
      const state = value ? drain.begin() : drain.end();
      if (!propagated) void propagate(value);
      return state;
    },
  };
}
