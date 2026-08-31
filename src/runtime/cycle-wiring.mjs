import { createPeerObservationClient } from '../cluster/peer-observations.mjs';
import { clientSqlAddress } from '../routing/client-address.mjs';
import { peerList } from './peer-list.mjs';
import { createPeerPublisher } from './peer-publisher.mjs';
import { startRuntimeCycles } from './cycles.mjs';

export function startSupervisorCycles({ peers: peerEnvironment, token, store, health, node, clusterId, getDrained, publishRoutingEvent, log, startCycles = startRuntimeCycles, createPeerClient = createPeerObservationClient, createPublisher = createPeerPublisher } = {}) {
  const peers = peerList(peerEnvironment);
  if (!peers.length) return { routingTimer: startCycles({ publishRoutingEvent }).routingTimer };
  const peerClient = createPeerClient({ peers, token, store, log });
  const publish = createPublisher({ health, observationStore: store, peerClient, node: { name: node, address: clientSqlAddress }, clusterId, getDrained });
  return startCycles({ publishRoutingEvent, publishPeers: publish });
}
