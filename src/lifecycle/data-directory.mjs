import fs from 'node:fs';

export function inspectDataDirectory(directory, { bootstrap = false } = {}) {
  let stat;
  try {
    stat = fs.statSync(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return { action: 'fail', reason: 'missing', message: `MariaDB data directory is missing: ${directory}` };
    throw error;
  }
  if (!stat.isDirectory()) return { action: 'fail', reason: 'not-directory', message: `MariaDB data path is not a directory: ${directory}` };
  try { fs.accessSync(directory, fs.constants.W_OK); } catch { return { action: 'fail', reason: 'not-writable', message: `MariaDB data directory is not writable: ${directory}` }; }
  const entries = fs.readdirSync(directory);
  const hasSystemDatabase = entries.includes('mysql');
  if (hasSystemDatabase) {
    if (bootstrap) return { action: 'fail', reason: 'bootstrap-on-initialized', message: `MariaDB data directory is already initialized; refusing bootstrap startup: ${directory}` };
    return { action: 'start', reason: 'initialized' };
  }
  if (entries.length === 0 && bootstrap) return { action: 'initialize', reason: 'empty-explicit-bootstrap' };
  if (entries.length === 0) return { action: 'fail', reason: 'empty', message: `MariaDB data directory is empty; explicit bootstrap is required: ${directory}` };
  return { action: 'fail', reason: 'suspicious', message: `MariaDB data directory is partially initialized or stale; refusing to initialize: ${directory}` };
}
