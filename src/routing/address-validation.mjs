import { promises as dns } from 'node:dns';

export async function filterReachableNodes(nodes, { resolve = (host) => dns.lookup(host), log = {} } = {}) {
  const result = [];
  for (const node of nodes) {
    try { await resolve(node.address); result.push(node); }
    catch (error) { log.warn?.('Routing address is unreachable', { host: node.address, error }); }
  }
  return result;
}
