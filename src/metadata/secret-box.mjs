import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const keyFor = (key) => createHash('sha256').update(String(key)).digest();
export function createSecretBox(key) {
  if (!key) throw new TypeError('credential encryption key is required');
  const keyBytes = keyFor(key);
  return {
    seal(value) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', keyBytes, iv); const data = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64'); },
    open(value) { const raw = Buffer.from(value, 'base64'); const decipher = createDecipheriv('aes-256-gcm', keyBytes, raw.subarray(0, 12)); decipher.setAuthTag(raw.subarray(12, 28)); return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'); }
  };
}
