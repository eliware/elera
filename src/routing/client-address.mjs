import { execFileSync } from 'node:child_process';

const command = (argument) => execFileSync('hostname', [argument], { encoding: 'utf8' }).trim();
const resolveDefaultFqdn = () => command('-f');
const resolveDefaultIp = () => command('-i');
const fqdnCache = new WeakMap();
const nodeAddressCache = new WeakMap();

export function nodeAddress(environment = process.env, resolveIp = resolveDefaultIp) {
  if (environment.ELERA_NODE_ADDRESS) return environment.ELERA_NODE_ADDRESS;
  if (environment.ELERA !== '1') return '127.0.0.1';
  if (!nodeAddressCache.has(resolveIp)) {
    try { nodeAddressCache.set(resolveIp, resolveIp() || '127.0.0.1'); } catch { nodeAddressCache.set(resolveIp, '127.0.0.1'); }
  }
  return nodeAddressCache.get(resolveIp);
}

export function clientSqlAddress(environment = process.env, resolveFqdn = resolveDefaultFqdn, resolveIp = resolveDefaultIp) {
  if (environment.ELERA === '1') {
    if (!fqdnCache.has(resolveFqdn)) {
      try { fqdnCache.set(resolveFqdn, resolveFqdn().trim() || nodeAddress(environment, resolveIp)); } catch { fqdnCache.set(resolveFqdn, nodeAddress(environment, resolveIp)); }
    }
    return fqdnCache.get(resolveFqdn);
  }
  return nodeAddress(environment);
}
