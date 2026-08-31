export const META_DATABASE = "elera_meta";
export const META_MIGRATIONS = [
  {
    version: 1,
    name: "metadata-foundation",
    statements: [
      "CREATE TABLE IF NOT EXISTS metadata (key_name VARCHAR(255) PRIMARY KEY, value_json JSON NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INT PRIMARY KEY, name VARCHAR(255) NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    ],
  },
  {
    version: 2,
    name: "managed-databases-identities-and-tokens",
    statements: [
      "CREATE TABLE IF NOT EXISTS elera_meta.applications (name VARCHAR(255) PRIMARY KEY, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS elera_meta.managed_databases (name VARCHAR(255) PRIMARY KEY, application_name VARCHAR(255) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS elera_meta.identities (name VARCHAR(255) PRIMARY KEY, application_name VARCHAR(255) NOT NULL, purpose VARCHAR(32) NOT NULL, database_name VARCHAR(255) NOT NULL, username VARCHAR(255) NOT NULL, host_pattern VARCHAR(255) NOT NULL DEFAULT '%', active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY identity_username (username, host_pattern))",
      "CREATE TABLE IF NOT EXISTS elera_meta.grants_policy (identity_name VARCHAR(255) PRIMARY KEY, grants_json JSON NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS elera_meta.scoped_tokens (name VARCHAR(255) PRIMARY KEY, token_hash CHAR(64) NOT NULL, application_name VARCHAR(255), identity_name VARCHAR(255), scopes_json JSON NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, rotated_at TIMESTAMP NULL)",
      "CREATE INDEX IF NOT EXISTS idx_managed_databases_application ON elera_meta.managed_databases(application_name)",
      "CREATE INDEX IF NOT EXISTS idx_identities_application ON elera_meta.identities(application_name)",
    ],
  },
  {
    version: 3,
    name: "encrypted-identity-credentials",
    statements: [
      "ALTER TABLE elera_meta.identities ADD COLUMN IF NOT EXISTS credential_ciphertext TEXT NULL",
    ],
  },
  {
    version: 4,
    name: "encrypted-artifact-metadata",
    statements: [
      "CREATE TABLE IF NOT EXISTS elera_meta.artifacts (name VARCHAR(255) PRIMARY KEY, kind VARCHAR(64) NOT NULL, ciphertext LONGTEXT NOT NULL, key_version VARCHAR(128) NOT NULL, checksum CHAR(64) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)",
    ],
  },
  {
    version: 5,
    name: "routing-writer-assignments",
    statements: [
      "CREATE TABLE IF NOT EXISTS elera_meta.routing_assignments (application_name VARCHAR(255) PRIMARY KEY, writer_host VARCHAR(255) NOT NULL, bundle_version VARCHAR(128) NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)",
    ],
  },
  {
    version: 6,
    name: "application-identifiers-and-admin-tokens",
    statements: [
      "ALTER TABLE elera_meta.applications ADD COLUMN IF NOT EXISTS application_id VARCHAR(32) NULL",
      "ALTER TABLE elera_meta.scoped_tokens ADD COLUMN IF NOT EXISTS token_id VARCHAR(32) NULL",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_id ON elera_meta.applications(application_id)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_scoped_tokens_id ON elera_meta.scoped_tokens(token_id)",
    ],
  },
  {
    version: 7,
    name: "stable-database-identifiers",
    statements: [
      "ALTER TABLE elera_meta.managed_databases ADD COLUMN IF NOT EXISTS database_id VARCHAR(32) NULL",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_managed_databases_id ON elera_meta.managed_databases(database_id)",
    ],
  },
  {
    version: 8,
    name: "application-scoped-token-identities",
    statements: [
      "UPDATE elera_meta.scoped_tokens SET token_id=LEFT(REPLACE(UUID(), '-', ''), 32) WHERE token_id IS NULL",
      "ALTER TABLE elera_meta.scoped_tokens DROP PRIMARY KEY, MODIFY token_id VARCHAR(32) NOT NULL, ADD PRIMARY KEY (token_id)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_scoped_tokens_application_name ON elera_meta.scoped_tokens(application_name, name)",
    ],
  },
];
