import { createSecretBox } from '../src/metadata/secret-box.mjs';

test('seals and opens credential material', () => { const box = createSecretBox('test-key'); const sealed = box.seal('password'); expect(sealed).not.toContain('password'); expect(box.open(sealed)).toBe('password'); });
test('requires an encryption key', () => { expect(() => createSecretBox()).toThrow('encryption key'); });
