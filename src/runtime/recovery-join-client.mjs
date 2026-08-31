export function createRecoveryJoinClient({ token, fetchImpl = fetch, timeoutMs = 30000 } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('recovery join client requires fetch');
  return {
    async join({ url, ...details } = {}) {
      if (typeof url !== 'string' || !url) throw new TypeError('recovery join target URL is required');
      const response = await fetchImpl(`${url.replace(/\/$/, '')}/api/v1/cluster/cold-recovery/join`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(details),
        signal: AbortSignal.timeout(timeoutMs),
      });
      let body;
      try { body = await response.json(); } catch { body = {}; }
      if (!response.ok || body.ok === false) throw Object.assign(new Error(body.error ?? `recovery join returned ${response.status}`), { code: body.code ?? 'RECOVERY_JOIN_FAILED', statusCode: response.status });
      return body.data;
    },
  };
}
