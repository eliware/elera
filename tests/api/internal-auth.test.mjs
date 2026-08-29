import { expect, test } from '@jest/globals';
import { isInternalPeerRequest } from '../src/api/internal-auth.mjs';
const request = (headers) => ({ headers });
test('accepts only correctly tagged peer requests', () => { expect(isInternalPeerRequest(request({}), {}, 'root')).toBe(false); expect(isInternalPeerRequest(request({ 'x-elera-internal': 'false', 'x-elera-peer-token': 'root' }), {}, 'root')).toBe(false); expect(isInternalPeerRequest(request({ 'x-elera-internal': 'true' }), {}, 'root')).toBe(false); expect(isInternalPeerRequest(request({ 'x-elera-internal': 'true', 'x-elera-peer-token': 'root' }), {}, 'root')).toBe(true); expect(isInternalPeerRequest(request({ 'x-elera-internal': 'true', 'x-elera-peer-token': 'peer' }), { ELERA_PEER_TOKEN: 'peer' }, 'root')).toBe(true); });
