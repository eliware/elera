import os from 'node:os';
import { execFileSync } from 'node:child_process';

const fullyQualifiedHostname = () => execFileSync('hostname', ['-f'], { encoding: 'utf8' }).trim();

export function runtimeIdentity({ hostname = fullyQualifiedHostname, addresses = os.networkInterfaces } = {}) {
  const name = hostname();
  const interfaces = addresses();
  const address = Object.values(interfaces).flat().find((item) => item && !item.internal && item.family === 'IPv4')?.address ?? '127.0.0.1';
  return Object.freeze({ name, address });
}
