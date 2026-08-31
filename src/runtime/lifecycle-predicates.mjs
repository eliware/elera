export function isShuttingDown(state) {
  return ['draining', 'stopping', 'stopped'].includes(state);
}
