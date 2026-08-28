export function createDrainEventPublisher({ bus, node, getReady, getContext = () => ({}), now = Date.now, log = {} } = {}) {
  if (!bus?.publish || typeof getReady !== 'function') throw new TypeError('drain event dependencies are required');
  return async function publish(draining) {
    if (draining) {
      bus.publish({ type: 'routing.drain', version: now(), node, ...getContext(), generatedAt: new Date(now()).toISOString() });
      return;
    }
    try {
      if ((await getReady())?.ready) bus.publish({ type: 'routing.recovery', version: now(), node, ...getContext(), generatedAt: new Date(now()).toISOString() });
    } catch (error) {
      log.warn?.('Recovery event withheld until node is ready', { error });
    }
  };
}
