import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { renderIntent } from './render.mjs';

export function createIntentState({ stateDir }) {
  if (!stateDir) throw new TypeError('stateDir is required');
  const activePath = join(stateDir, 'active.intent.json'); const renderedPath = join(stateDir, 'mariadb.cnf'); const previousPath = join(stateDir, 'last-known-good.intent.json');
  const readActive = async () => { try { return JSON.parse(await readFile(activePath, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
  const atomicWrite = async (path, content) => { const temporary = `${path}.tmp-${process.pid}`; await writeFile(temporary, content, 'utf8'); await rename(temporary, path); };
  return {
    async plan(intent) { const rendered = renderIntent(intent); const active = await readActive(); return { changed: !active || JSON.stringify(active) !== JSON.stringify(rendered.intent), desiredHash: rendered.hash, activeHash: active ? renderIntent(active).hash : null, change: !active ? 'restart' : JSON.stringify(active) === JSON.stringify(rendered.intent) ? 'no-op' : 'reload' }; },
    async apply(intent) { const rendered = renderIntent(intent); const active = await readActive(); await mkdir(dirname(activePath), { recursive: true }); if (active) await atomicWrite(previousPath, JSON.stringify(active, null, 2)); await atomicWrite(activePath, JSON.stringify(rendered.intent, null, 2)); await atomicWrite(renderedPath, rendered.mariadb); return { ok: true, hash: rendered.hash, path: renderedPath, previous: Boolean(active) }; },
    async verify(intent) { const rendered = renderIntent(intent); const active = await readActive(); return { ok: Boolean(active) && renderIntent(active).hash === rendered.hash, desiredHash: rendered.hash, activeHash: active ? renderIntent(active).hash : null }; },
    paths: Object.freeze({ activePath, renderedPath, previousPath })
  };
}
