export function createSqlQuiesce({ drain, timeoutMs = 30000, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  if (!drain || typeof drain.begin !== 'function' || typeof drain.wait !== 'function') throw new TypeError('drain manager is required');
  return {
    async begin() {
      drain.begin();
      await drain.wait(timeoutMs);
      await sleep(timeoutMs);
      return { drained: true, settled: true };
    },
  };
}
