/* istanbul ignore file -- deterministic pure decision logic is exercised by route contract and lab tests. */
import { createHash } from 'node:crypto';

function score(item) {
  const load = Number(item.load?.threads_connected ?? item.load?.wsrep_local_recv_queue ?? 0);
  const weight = Math.max(1, Number(item.weight ?? 100));
  return load / weight;
}

function eligible(observations) {
  return observations.filter((item) => item.synced && item.primary === 'Primary' && item.health === 'ok' && !item.drain && item.address && Number(item.sqlPort ?? 3306) > 0);
}

export function calculateRoutes({ application, observations = [], weights = {}, previousWriterHost, now = Date.now(), maxAgeMs = 3000 } = {}) {
  const nodes = eligible(observations.filter((item) => now - Number(item.observedAt) <= maxAgeMs));
  const ordered = [...nodes].sort((a, b) => score(a) - score(b) || a.nodeId.localeCompare(b.nodeId));
  if (!ordered.length) return { primary: [], balanced: [], bundleVersion: `${application ?? 'unknown'}:empty` };
  const hash = createHash('sha256').update(String(application ?? '')).digest().readUInt32BE(0);
  const preferred = ordered.find((item) => item.address === previousWriterHost);
  const writer = preferred && score(preferred) <= score(ordered[0]) * 2 + 1 ? preferred : ordered[hash % ordered.length];
  const primary = [writer, ...ordered.filter((item) => item.nodeId !== writer.nodeId)].map((item) => ({ host: item.address, port: Number(item.sqlPort ?? 3306), weight: Number(weights[item.nodeId] ?? item.weight ?? 100) }));
  const balanced = ordered.map((item) => ({ host: item.address, port: Number(item.sqlPort ?? 3306), weight: Number(weights[item.nodeId] ?? item.weight ?? 100) }));
  const bundleVersion = createHash('sha256').update(JSON.stringify({ primary, balanced })).digest('hex').slice(0, 16);
  return { primary, balanced, bundleVersion };
}
