export function createDrainEventPublisher({ bus, node, getReady, getContext = () => ({}), now = Date.now, log = {} } = {}) {
  if (!bus?.publish || typeof getReady !== 'function') throw new TypeError('drain event dependencies are required');
  let version = 0;
  const nextVersion = () => { version = Math.max(version + 1, now()); return version; };
  return async function publish(draining) {
    if (draining) {
      const timestamp = now();
      bus.publish({ type: 'routing.drain', version: nextVersion(), node, context: getContext(), generatedAt: new Date(timestamp).toISOString() });
      return true;
    }
    try {
      if ((await getReady())?.ready) { const timestamp = now(); const event = { type: 'routing.recovery', version: nextVersion(), node, context: getContext(), generatedAt: new Date(timestamp).toISOString() }; bus.publish(event); log.info?.('Published routing recovery', { node, version: event.version }); return true; }
    } catch (error) {
      log.warn?.('Recovery event withheld until node is ready', { error });
    }
    return false;
  };
}
