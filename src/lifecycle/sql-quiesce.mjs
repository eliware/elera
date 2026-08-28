export function createSqlQuiesce({ drain, timeoutMs = 30000 } = {}) {
  if (!drain || typeof drain.begin !== 'function' || typeof drain.wait !== 'function') throw new TypeError('drain manager is required');
  return {
    async begin(limitMs = timeoutMs) {
      drain.begin();
      const settled = await drain.wait(limitMs);
      return { drained: true, settled };
    },
  };
}
