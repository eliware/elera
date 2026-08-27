export const META_DATABASE = 'elera_meta';
export const META_MIGRATIONS = [{ version: 1, name: 'metadata-foundation', statements: [
  'CREATE TABLE IF NOT EXISTS metadata (key_name VARCHAR(255) PRIMARY KEY, value_json JSON NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS schema_migrations (version INT PRIMARY KEY, name VARCHAR(255) NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)'
] }];
