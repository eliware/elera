import { createHash, timingSafeEqual } from 'node:crypto';
export function tokenMatches(request, expected) { if (!expected) return false; const supplied = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? ''; const a = createHash('sha256').update(supplied).digest(); const b = createHash('sha256').update(expected).digest(); return timingSafeEqual(a, b); }
