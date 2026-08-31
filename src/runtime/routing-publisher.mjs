export function createRoutingPublisher({ event, bus, assignments, application = 'default' } = {}) {
  const publishedVersions = new Map();
  return function publishRoutingEvent() {
    const applications = new Set([application, ...assignments.applications()]);
    for (const name of applications) {
      const value = event(name);
      if (value && value.version !== publishedVersions.get(name)) {
        publishedVersions.set(name, value.version);
        bus.publish(value);
      }
    }
  };
}
