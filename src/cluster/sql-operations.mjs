const isFqdn = (value) => typeof value === 'string' && value.length <= 253 && value.includes('.') && value.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
export function createClusterOperations({ query, processController, setDrain }) {
  if (typeof query !== 'function') throw new TypeError('query function is required');
  return {
    async bootstrap() { await query('SET GLOBAL wsrep_on=ON'); },
    async join({ target }) { if (!isFqdn(target)) throw new TypeError('join target must be a fully qualified hostname'); await query('SET GLOBAL wsrep_on=ON'); },
    async leave() { await setDrain?.(true); await query('SET GLOBAL wsrep_desync=ON'); await query('SET GLOBAL wsrep_on=OFF'); },
    async recover() { await query('SET GLOBAL wsrep_on=ON'); await processController?.start?.(); }
  };
}
