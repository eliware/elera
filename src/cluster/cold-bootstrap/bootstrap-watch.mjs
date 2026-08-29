export function createBootstrapWatch({ health, timeoutMs, intervalMs = 1000, isReady = (result) => result.ready, onTimeout } = {}) {
  if (!health || typeof health.status !== 'function' || !Number.isFinite(timeoutMs)) throw new TypeError('bootstrap watch dependencies are required');
  return async function watch() {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      try { if (isReady(await health.status())) return { ready: true }; } catch {}
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
    }
    await onTimeout?.();
    return { ready: false, timedOut: true };
  };
}
