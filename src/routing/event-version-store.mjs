import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function createEventVersionStore({ path } = {}) {
  let versions = {};
  if (!path) return { next(application) { return versions[application] = Number(versions[application] ?? 0) + 1; }, current(application) { return Number(versions[application] ?? 0); } };
  if (existsSync(path)) { try { versions = JSON.parse(readFileSync(path, 'utf8')); } catch { versions = {}; } }
  return {
    next(application) { const value = Number(versions[application] ?? 0) + 1; versions[application] = value; mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(versions)}\n`, { mode: 0o600 }); return value; },
    current(application) { return Number(versions[application] ?? 0); },
  };
}
