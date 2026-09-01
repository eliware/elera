import os from 'node:os';

export function runtimeIdentity({ hostname = os.hostname, addresses = os.networkInterfaces, name: configuredName } = {}) {
  const name = configuredName ?? hostname();
  const interfaces = addresses();
  const address = Object.values(interfaces).flat().find((item) => item && !item.internal && item.family === 'IPv4')?.address ?? '127.0.0.1';
  return Object.freeze({ name, address });
}
