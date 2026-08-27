export function createClusterOperations({ query, processController, setDrain }) {
  if (typeof query !== 'function') throw new TypeError('query function is required');
  return {
    async bootstrap() { await query('SET GLOBAL wsrep_on=ON'); },
    async join({ target }) { if (!target) throw new TypeError('join target is required'); await query('SET GLOBAL wsrep_on=ON'); },
    async leave() { setDrain?.(true); await query('SET GLOBAL wsrep_desync=ON'); await query('SET GLOBAL wsrep_on=OFF'); },
    async recover() { await query('SET GLOBAL wsrep_on=ON'); await processController?.start?.(); }
  };
}
