import { chmod, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export async function promoteSafeToBootstrap(path, { read = readFile, write = writeFile, move = rename, setMode = chmod } = {}) {
  if (typeof path !== 'string' || !path) throw new TypeError('state path is required');
  const source = await read(path, 'utf8');
  if (!/^\s*safe_to_bootstrap:\s*[01]\s*$/m.test(source)) throw new Error(`invalid Galera state file: ${path}`);
  const promoted = source.replace(/^(\s*safe_to_bootstrap:)\s*[01]\s*$/m, '$1 1');
  if (promoted === source) return { changed: false, path };
  const temporary = `${path}.elera-promote.tmp-${process.pid}-${randomUUID()}`;
  try { await write(temporary, promoted, { encoding: 'utf8', mode: 0o660 }); await setMode(temporary, 0o660); await move(temporary, path); }
  finally { try { await rm(temporary, { force: true }); } catch { /* best-effort cleanup */ } }
  return { changed: true, path };
}
