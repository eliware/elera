import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value) => createHash('sha256').update(value).digest();

function storedDigest(value) {
  if (Buffer.isBuffer(value)) return value.length === 32 ? value : Buffer.from(value.toString(), 'hex');
  return Buffer.from(String(value ?? '').trim(), 'hex');
}

export function tokenMatchesHash(token, storedHash) {
  if (typeof token !== 'string' || token.length === 0) return false;
  const supplied = digest(token);
  const stored = storedDigest(storedHash);
  return stored.length === supplied.length && timingSafeEqual(stored, supplied);
}
