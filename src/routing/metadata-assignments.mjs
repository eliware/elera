import { literal } from '../accounts/sql.mjs';

export function createMetadataAssignmentStore({ query, database = 'elera_meta' } = {}) {
  if (typeof query !== 'function') throw new TypeError('assignment query is required');
  const cache = new Map();
  const q = (sql) => query(sql.replaceAll('elera_meta', `\`${database}\``));
  return {
    peek(application) { return cache.get(application); },
    applications() { return [...cache.keys()]; },
    async get(application) {
      const [rows] = await q(`SELECT writer_host FROM elera_meta.routing_assignments WHERE application_name=${literal(application)}`);
      const writer = rows[0]?.writer_host; if (writer) cache.set(application, writer); return writer;
    },
    async set(application, writer, bundleVersion = '1') {
      cache.set(application, writer);
      await q(`INSERT INTO elera_meta.routing_assignments (application_name, writer_host, bundle_version) VALUES (${literal(application)}, ${literal(writer)}, ${literal(bundleVersion)}) ON DUPLICATE KEY UPDATE writer_host=VALUES(writer_host), bundle_version=VALUES(bundle_version)`);
      return writer;
    },
  };
}
