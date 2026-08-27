export const META_DATABASE = 'elera_meta';
export const META_MIGRATIONS = [{ version: 1, name: 'metadata-foundation', statements: [
  'CREATE TABLE IF NOT EXISTS metadata (key_name VARCHAR(255) PRIMARY KEY, value_json JSON NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS schema_migrations (version INT PRIMARY KEY, name VARCHAR(255) NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)'
] }, { version: 2, name: 'managed-databases-identities-and-tokens', statements: [
  'CREATE TABLE IF NOT EXISTS applications (name VARCHAR(255) PRIMARY KEY, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS managed_databases (name VARCHAR(255) PRIMARY KEY, application_name VARCHAR(255) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS identities (name VARCHAR(255) PRIMARY KEY, application_name VARCHAR(255) NOT NULL, purpose VARCHAR(32) NOT NULL, database_name VARCHAR(255) NOT NULL, username VARCHAR(255) NOT NULL, host_pattern VARCHAR(255) NOT NULL DEFAULT \'%\', active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY identity_username (username, host_pattern))',
  'CREATE TABLE IF NOT EXISTS grants_policy (identity_name VARCHAR(255) PRIMARY KEY, grants_json JSON NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS scoped_tokens (name VARCHAR(255) PRIMARY KEY, token_hash CHAR(64) NOT NULL, application_name VARCHAR(255), identity_name VARCHAR(255), scopes_json JSON NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, rotated_at TIMESTAMP NULL)',
  'CREATE INDEX IF NOT EXISTS idx_managed_databases_application ON managed_databases(application_name)',
  'CREATE INDEX IF NOT EXISTS idx_identities_application ON identities(application_name)'
] }, { version: 3, name: 'encrypted-identity-credentials', statements: [
  'ALTER TABLE identities ADD COLUMN IF NOT EXISTS credential_ciphertext TEXT NULL'
] }];
