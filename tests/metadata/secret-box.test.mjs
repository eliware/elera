import { createSecretBox } from '../../src/metadata/secret-box.mjs';

test('seals and opens credential material', () => { const box = createSecretBox('test-key'); const sealed = box.seal('password'); expect(sealed).not.toContain('password'); expect(box.open(sealed)).toBe('password'); });
test('requires an encryption key', () => { expect(() => createSecretBox()).toThrow('encryption key'); });
test('rejects tampered or malformed ciphertext', () => {
  const box = createSecretBox('test-key');
  const sealed = Buffer.from(box.seal('password'), 'base64'); sealed[sealed.length - 1] ^= 1;
  expect(() => box.open(sealed.toString('base64'))).toThrow();
  expect(() => box.open('not-base64')).toThrow();
});
