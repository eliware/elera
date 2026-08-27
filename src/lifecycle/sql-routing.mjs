export function createSqlDrainIntegration({ getClient, node = 'elera', log } = {}) {
  return (draining) => {
    const client = getClient?.();
    if (!client?.setNodeAvailability) return;
    try {
      client.setNodeAvailability('primary', node, !draining);
      client.setNodeAvailability('balanced', node, !draining);
    } catch (error) {
      log?.warn?.('Unable to update local SQL route availability', { node, draining, error });
    }
  };
}
