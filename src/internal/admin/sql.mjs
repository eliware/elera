export function createAdminSql({ query }) {
  if (typeof query !== 'function') throw new TypeError('query function is required');
  return {
    async transaction(work) { await query('START TRANSACTION'); try { const result = await work({ query }); await query('COMMIT'); return result; } catch (error) { try { await query('ROLLBACK'); } catch {} throw error; } },
    async migration(statements = []) { return this.transaction(async ({ query: run }) => { for (const statement of statements) { if (typeof statement !== 'string' || !statement.trim()) throw new TypeError('migration statements must be non-empty strings'); await run(statement); } }); }
  };
}
