import { createHash } from "node:crypto";

function score(item) {
  const load = Number(
    item.load?.threads_connected ?? item.load?.wsrep_local_recv_queue ?? 0,
  );
  const weight = Math.max(1, Number(item.weight ?? 100));
  return load / weight;
}

function eligible(observations) {
  return observations.filter(
    (item) =>
      item.synced &&
      item.primary === "Primary" &&
      item.health === "ok" &&
      !item.drain &&
      item.address &&
      Number(item.sqlPort ?? 3306) > 0,
  );
}

export function calculateRoutes({
  application,
  observations = [],
  weights = {},
  previousWriterHost,
  now = Date.now(),
  maxAgeMs = 3000,
} = {}) {
  const nodes = eligible(
    observations.filter((item) => now - Number(item.observedAt) <= maxAgeMs),
  );
  const ordered = [...nodes].sort(
    (a, b) => score(a) - score(b) || a.nodeId.localeCompare(b.nodeId),
  );
  const stable = [...nodes].sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  if (!ordered.length)
    return {
      primary: [],
      balanced: [],
      bundleVersion: `${application ?? "unknown"}:empty`,
    };
  else {
    const hash = createHash("sha256")
      .update(String(application ?? ""))
      .digest()
      .readUInt32BE(0);
    const preferred = ordered.find(
      (item) => item.address === previousWriterHost,
    );
    // A persisted assignment is authoritative while its node remains eligible.
    // Load affects reader ordering, but must not cause writer churn every tick.
    // Local load observations may arrive in different orders on each
    // supervisor. Initial election must therefore use stable node identity;
    // reader ordering can still use current load.
    const writer = preferred ?? stable[hash % stable.length];
    const primary = [
      writer,
      ...ordered.filter((item) => item.nodeId !== writer.nodeId),
    ].map((item) => ({
      host: item.address,
      port: Number(item.sqlPort ?? 3306),
      // Writer preference is explicit in `writer`; failover is represented by
      // list order, never by the legacy 100/0/0 weight convention.
      weight: Number(weights[item.nodeId] ?? item.weight ?? 1),
    }));
    const balanced = ordered.map((item) => ({
      host: item.address,
      port: Number(item.sqlPort ?? 3306),
      weight: Number(weights[item.nodeId] ?? item.weight ?? 100),
    }));
    const bundleVersion = createHash("sha256")
      .update(JSON.stringify({ primary, balanced }))
      .digest("hex")
      .slice(0, 16);
    const failover = primary.slice(1).map(({ host, port }) => ({ host, port }));
    return { writer: { host: primary[0].host, port: primary[0].port }, failover, readers: balanced.map(({ host, port }) => ({ host, port })), primary, balanced, bundleVersion };
  }
}
