import { expect, jest, test } from "@jest/globals";
import { handleRoutingRoute } from "../src/api/routes/routing.mjs";

const request = (body = {}) => ({
  url: "http://localhost/api",
  async *[Symbol.asyncIterator]() {
    if (Object.keys(body).length) yield JSON.stringify(body);
  },
});
const node = {
  nodeId: "n",
  clusterId: "c",
  address: "db",
  sqlPort: 3306,
  synced: true,
  primary: "Primary",
  health: "ok",
  observedAt: Date.now(),
};
const context = (method, path, observations = [node], body = {}) => {
  const response = { json: jest.fn() };
  const observationStore = { snapshot: () => observations, upsert: jest.fn() };
  return {
    method,
    path,
    url: new URL(`http://localhost${path}`),
    request: request(body),
    response,
    observationStore,
    getStatus: jest.fn(async () => ({
      ready: true,
      values: {
        wsrep_local_state_comment: "Synced",
        wsrep_cluster_status: "Primary",
      },
    })),
    routingBundles: {
      lease: jest.fn(async () => ({
        routes: { primary: [{ host: "db", port: 3306 }] },
        bundleVersion: "v1",
        expiresAt: "2099-01-01",
      })),
    },
    routingEvent: jest.fn(() => undefined),
    environment: {
      ELERA_CLUSTER_SIZE: "1",
      ELERA_NODE_ADDRESS: "local",
      ELERA_NODE_SQL_PORT: "3306",
      ELERA_PEERS: "",
    },
  };
};

test("serves calculated routes, refreshes bundles, and validates bundle identity", async () => {
  const healthy = context("GET", "/api/v1/routes");
  healthy.url = new URL("http://localhost/api/v1/routes?application=app");
  expect(await handleRoutingRoute(healthy)).toBe(true);
  expect(healthy.response.json).toHaveBeenCalledWith(
    200,
    expect.objectContaining({ operation: "routes.inspect" }),
  );
  const refresh = context("POST", "/api/v1/routes/refresh", [], {
    identity: "id",
  });
  expect(await handleRoutingRoute(refresh)).toBe(true);
  expect(refresh.response.json).toHaveBeenCalledWith(
    200,
    expect.objectContaining({ operation: "routes.refresh" }),
  );
  const bundle = context("GET", "/api/v1/routing/bundle");
  bundle.url = new URL("http://localhost/api/v1/routing/bundle?identity=id");
  expect(await handleRoutingRoute(bundle)).toBe(true);
  await expect(
    handleRoutingRoute(context("GET", "/api/v1/routing/bundle")),
  ).rejects.toMatchObject({ statusCode: 400 });
});
test("uses local fallback when no eligible observations remain", async () => {
  const c = context("GET", "/api/v1/routes", [{ ...node, synced: false }]);
  expect(await handleRoutingRoute(c)).toBe(true);
  expect(c.response.json).toHaveBeenCalledWith(
    200,
    expect.objectContaining({
      data: expect.objectContaining({ bundleVersion: "default:local" }),
    }),
  );
  const noFallback = context("GET", "/api/v1/routes", []);
  noFallback.getStatus.mockResolvedValue({ ready: false });
  await expect(handleRoutingRoute(noFallback)).resolves.toBe(true);
});
test("returns false for unrelated routing requests", async () => {
  expect(await handleRoutingRoute(context("GET", "/other"))).toBe(false);
  expect(await handleRoutingRoute(context("PUT", "/api/v1/routes"))).toBe(
    false,
  );
});
test("uses seeded and cached routes and refreshes from peers", async () => {
  const seed = {
    primary: [{ host: "seed", port: 3306 }],
    balanced: [{ host: "seed", port: 3306 }],
  };
  const seeded = context("GET", "/api/v1/routes", []);
  seeded.routingEvent = () => ({ routes: seed });
  await handleRoutingRoute(seeded);
  expect(seeded.response.json).toHaveBeenCalledWith(
    200,
    expect.objectContaining({ data: seed }),
  );
  const cached = context("GET", "/api/v1/routes", []);
  cached.routingEvent = () => undefined;
  await handleRoutingRoute(cached);
  expect(cached.response.json).toHaveBeenCalled();
  const peer = context("GET", "/api/v1/routes", []);
  peer.environment.ELERA_PEERS = "http://peer";
  peer.getStatus.mockRejectedValue(new Error("status unavailable"));
  peer.fetchImpl = undefined;
  peer.observationStore.snapshot = () => [node];
  await handleRoutingRoute(peer);
});
test("retains recent calculated routes during a temporary observation gap", async () => {
  const healthy = context("GET", "/api/v1/routes", [node]);
  healthy.url = new URL("http://localhost/api/v1/routes?application=cached");
  await handleRoutingRoute(healthy);
  const degraded = context("GET", "/api/v1/routes", [
    { ...node, synced: false },
  ]);
  degraded.url = healthy.url;
  degraded.getStatus.mockResolvedValue({ ready: false });
  await handleRoutingRoute(degraded);
  expect(degraded.response.json).toHaveBeenCalledWith(
    200,
    expect.objectContaining({
      data: expect.objectContaining({ balanced: expect.any(Array) }),
    }),
  );
});
test("handles route inspection without a status fallback provider", async () => {
  const c = context("GET", "/api/v1/routes", []);
  c.getStatus = undefined;
  c.environment.ELERA_NODE_ADDRESS = undefined;
  await expect(handleRoutingRoute(c)).resolves.toBe(true);
});
test("handles absent observation APIs and peer-refreshed routes", async () => {
  const sparse = context("GET", "/api/v1/routes", []);
  sparse.observationStore = {};
  sparse.getStatus = undefined;
  await expect(handleRoutingRoute(sparse)).resolves.toBe(true);
  let observations = [];
  const peer = context("GET", "/api/v1/routes", []);
  peer.getStatus = undefined;
  peer.observationStore = {
    snapshot: () => observations,
    upsert: (item) => {
      observations = [item];
    },
  };
  peer.environment.ELERA_PEERS = "http://peer";
  peer.fetchImpl = async () => ({
    ok: true,
    json: async () => ({ data: [node] }),
  });
  await expect(handleRoutingRoute(peer)).resolves.toBe(true);
  const local = context("GET", "/api/v1/routes", []);
  local.environment.ELERA_NODE_SQL_PORT = undefined;
  local.observationStore = { snapshot: () => [], upsert: jest.fn() };
  local.routingEvent = () => undefined;
  await expect(handleRoutingRoute(local)).resolves.toBe(true);
});
test("handles a failed status provider during local route fallback", async () => {
  const c = context("GET", "/api/v1/routes", []);
  c.getStatus = jest.fn().mockRejectedValue(new Error("status unavailable"));
  c.observationStore = { snapshot: () => [], upsert: jest.fn() };
  c.environment.ELERA_NODE_ADDRESS = undefined;
  await expect(handleRoutingRoute(c)).resolves.toBe(true);
});
test("uses the local fallback port and optional observation snapshot paths", async () => {
  const c = context("GET", "/api/v1/routes", []);
  c.observationStore = { snapshot: undefined, upsert: jest.fn() };
  c.environment.ELERA_NODE_SQL_PORT = undefined;
  c.clientAddress = () => 'local';
  await expect(handleRoutingRoute(c)).resolves.toBe(true);
});
test("uses default local SQL port when a ready node has no observation", async () => {
  const c = context("GET", "/api/v1/routes", []);
  c.url = new URL("http://localhost/api/v1/routes?application=port-test");
  c.observationStore = { snapshot: () => null, upsert: jest.fn() };
  c.environment.ELERA_NODE_SQL_PORT = undefined;
  c.clientAddress = () => 'local';
  await expect(handleRoutingRoute(c)).resolves.toBe(true);
  expect(c.response.json).toHaveBeenCalledWith(
    200,
    expect.objectContaining({
      data: expect.objectContaining({
        primary: [{ host: "local", port: 3306, weight: 100 }],
      }),
    }),
  );
});
test("executes optional routing providers on an uncached application", async () => {
  const missing = context("GET", "/api/v1/routes", []);
  missing.url = new URL(
    "http://localhost/api/v1/routes?application=missing-provider",
  );
  missing.getStatus = undefined;
  missing.observationStore = undefined;
  await expect(handleRoutingRoute(missing)).resolves.toBe(true);
  const failed = context("GET", "/api/v1/routes", []);
  failed.url = new URL(
    "http://localhost/api/v1/routes?application=failed-provider",
  );
  failed.getStatus = jest
    .fn()
    .mockRejectedValue(new Error("status unavailable"));
  failed.observationStore = undefined;
  await expect(handleRoutingRoute(failed)).resolves.toBe(true);
});
