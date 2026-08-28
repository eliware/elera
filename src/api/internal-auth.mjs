import { tokenMatches } from './authentication.mjs';

export function isInternalPeerRequest(request, environment, fallbackToken) {
  const supplied = request.headers?.['x-elera-peer-token'];
  if (request.headers?.['x-elera-internal'] !== 'true' || !supplied) return false;
  return tokenMatches({ headers: { authorization: `Bearer ${supplied}` } }, environment.ELERA_PEER_TOKEN ?? fallbackToken);
}
