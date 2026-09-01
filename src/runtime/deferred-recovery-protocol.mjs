export function createDeferredRecoveryProtocol(getProtocol, { timeoutMs = 5000, intervalMs = 25 } = {}) {
  const wait = async () => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const protocol = getProtocol?.();
      if (protocol) return protocol;
      await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, Math.max(1, deadline - Date.now()))));
    }
    throw Object.assign(new Error('recovery protocol initialization did not complete'), { code: 'RECOVERY_UNAVAILABLE', statusCode: 503 });
  };
  return Object.fromEntries(['evidence', 'status', 'plan', 'retry', 'authorize', 'beginBootstrap', 'complete'].map((method) => [method, async (...args) => (await wait())[method](...args)]));
}
