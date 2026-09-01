import { createPeerObservationClient } from '../cluster/peer-observations.mjs';
import { peerList } from './peer-list.mjs';
import { createPeerPublisher } from './peer-publisher.mjs';
import { startRuntimeCycles } from './cycles.mjs';

export function startSupervisorCycles({ peers: peerEnvironment, token, store, health, identity, clusterId, getDrained, publishRoutingEvent, log, startCycles = startRuntimeCycles, createPeerClient = createPeerObservationClient, createPublisher = createPeerPublisher } = {}) {
  if (!identity?.name || !identity.name.includes('.')) throw new TypeError('shared cycle identity must be a fully qualified hostname');
  if (!store || typeof health?.status !== 'function' || typeof publishRoutingEvent !== 'function') throw new TypeError('runtime cycle dependencies are required');
  if (!Array.isArray(peerEnvironment)) throw new TypeError('configured cycle peers are required; environment peer discovery is not supported');
  const peers = peerEnvironment.flatMap((peer) => typeof peer === 'string' ? peerList(peer) : [peer]).filter(Boolean);
  if (peers.some((peer) => (typeof peer === 'string' ? !peer.includes('.') : !peer.name?.includes('.')))) throw new TypeError('cycle peers must use fully qualified identities');
  if (!peers.length) return { routingTimer: startCycles({ publishRoutingEvent }).routingTimer };
  const peerClient = createPeerClient({ peers, token, store, log });
  const publish = createPublisher({ health, observationStore: store, peerClient, node: identity, clusterId, getDrained });
  return startCycles({ publishRoutingEvent, publishPeers: publish });
}
