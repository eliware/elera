export function createMigrationRunner({ query, migrations = [] }) {
  if (typeof query !== 'function') throw new TypeError('query function is required');
  if (!Array.isArray(migrations)) throw new TypeError('migrations must be an array');
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  return {
    async status() {
      const [rows] = await query('SELECT version, name FROM schema_migrations ORDER BY version');
      return { applied: rows };
    },
    async migrate() {
      await query('CREATE TABLE IF NOT EXISTS schema_migrations (version INT PRIMARY KEY, name VARCHAR(255) NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)');
      const [rows] = await query('SELECT version FROM schema_migrations ORDER BY version');
      const applied = new Set(rows.map((row) => Number(row.version)));
      for (const migration of ordered) {
        if (!Number.isInteger(migration.version) || !migration.name || !Array.isArray(migration.statements)) throw new TypeError('invalid migration');
        if (applied.has(migration.version)) continue;
        await query('START TRANSACTION');
        try {
          for (const statement of migration.statements) { if (typeof statement !== 'string' || !statement.trim()) throw new TypeError('migration statements must be non-empty strings'); await query(statement); }
          await query('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [migration.version, migration.name]);
          await query('COMMIT');
        } catch (error) { try { await query('ROLLBACK'); } catch {} throw error; }
      }
      return this.status();
    }
  };
}
