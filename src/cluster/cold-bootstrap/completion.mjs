export function createRecoveryCompletion() {
  let value;
  return {
    publish(completion) {
      if (!completion?.epoch || !['complete', 'failed'].includes(completion.status)) throw new TypeError('valid bootstrap completion is required');
      if (value?.status === 'complete' && value.epoch === completion.epoch) return value;
      value = Object.freeze({ ...completion });
      return value;
    },
    read() { return value; },
  };
}

export async function waitForRecoveryCompletion({ url, epoch, token, fetchImpl = fetch, timeoutMs = 30000, intervalMs = 250 } = {}) {
  if (!url || !epoch || typeof fetchImpl !== 'function') throw new TypeError('recovery completion dependencies are required');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    try {
      const response = await fetchImpl(`${url.replace(/\/$/, '')}/api/v1/cluster/cold-bootstrap/completion`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(Math.min(intervalMs * 2, 1000)) });
      if (response.ok) {
        const body = await response.json();
        if (body.data?.epoch === epoch && body.data?.status === 'complete') return body.data;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, Math.max(0, deadline - Date.now()))));
  }
  throw Object.assign(new Error('bootstrap completion was not observed before timeout'), { code: 'RECOVERY_COMPLETION_TIMEOUT' });
}
