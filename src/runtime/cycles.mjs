export function startRuntimeCycles({ publishRoutingEvent, publishPeers, setIntervalImpl = setInterval } = {}) {
  const routingTimer = setIntervalImpl(publishRoutingEvent, 1000);
  routingTimer.unref?.();
  publishRoutingEvent();
  const peerTimer = publishPeers ? setIntervalImpl(() => { void publishPeers(); }, 1000) : undefined;
  peerTimer?.unref?.();
  if (publishPeers) void publishPeers();
  return { routingTimer, peerTimer };
}

export function stopRuntimeCycles({ routingTimer, peerTimer, clearIntervalImpl = clearInterval } = {}) {
  for (const timer of [routingTimer, peerTimer]) if (timer) clearIntervalImpl(timer);
}
