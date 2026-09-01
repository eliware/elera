import { isIP } from 'node:net';

export function createDrainPropagation({ drain, peers = [], token, fetchImpl = fetch, log = {} } = {}) {
  if (!drain || typeof drain.begin !== 'function' || typeof drain.end !== 'function') throw new TypeError('drain manager is required');
  const targets = [...new Set(peers.filter(Boolean).map((peer) => {
    if (typeof peer !== 'string') throw new TypeError('drain propagation peers must be FQDN URLs');
    let url;
    try {
      url = new URL(peer);
    } catch {
      throw new TypeError('drain propagation peers must be FQDN URLs');
    }
    if (!['http:', 'https:'].includes(url.protocol) || isIP(url.hostname) || !url.hostname.includes('.') || url.hostname.endsWith('.')) {
      throw new TypeError('drain propagation peers must be FQDN URLs');
    }
    return peer.replace(/\/+$/, '');
  }))];
  const propagate = (value) => Promise.all(targets.map(async (peer) => {
    try {
      const headers = { 'x-elera-drain-propagated': 'true' };
      if (token) headers.authorization = `Bearer ${token}`;
      const response = await fetchImpl(`${peer}/api/v1/traffic/${value ? 'drain' : 'undrain'}`, {
        method: 'POST', headers,
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
