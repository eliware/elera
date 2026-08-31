import { afterEach, expect, jest, test } from "@jest/globals";
import os from "node:os";
import { createPendingInitServer } from "../../../src/lifecycle/pending-init/server.mjs";

const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
const close = (server) => new Promise((resolve) => server.close(resolve));
let server;
afterEach(async () => { if (server?.listening) await close(server); server = undefined; });

test("pending initialization is live but not ready and requires the root token", async () => {
  const initialize = jest.fn();
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: "root" }, initialize }));
  const port = await listen(server);
  expect((await fetch(`http://127.0.0.1:${port}/healthz`)).status).toBe(200);
  expect((await fetch(`http://127.0.0.1:${port}/readyz`)).status).toBe(503);
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/bootstrap`, { method: "POST" });
  expect(response.status).toBe(401);
  expect(initialize).not.toHaveBeenCalled();
});

test("pending recovery exposes root-only node reset while SQL is unavailable", async () => {
  const nodeDataReset = { reset: jest.fn().mockResolvedValueOnce({ dryRun: true, status: "planned" }).mockResolvedValueOnce({ dryRun: false, status: "completed" }) };
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: "root" }, nodeDataReset }));
  const port = await listen(server);
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/node/data/reset`, { method: "POST", headers: { authorization: "Bearer root", "content-type": "application/json" }, body: JSON.stringify({ dryRun: true }) });
  expect(response.status).toBe(200); expect(nodeDataReset.reset).toHaveBeenCalledWith({ dryRun: true });
  expect((await fetch(`http://127.0.0.1:${port}/api/v1/node/data/reset`, { method: "POST", headers: { authorization: "Bearer root", "content-type": "application/json" }, body: JSON.stringify({ dryRun: false }) })).status).toBe(202);
  expect((await fetch(`http://127.0.0.1:${port}/api/v1/node/data/reset`, { method: "POST" })).status).toBe(401);
});

test("pending recovery reports unavailable reset configuration and reset failures", async () => {
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: "root" } }));
  const port = await listen(server);
  expect((await fetch(`http://127.0.0.1:${port}/api/v1/node/data/reset`, { method: "POST", headers: { authorization: "Bearer root" }, body: "{}" })).status).toBe(503);
  await close(server); server = undefined;
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: "root" }, nodeDataReset: { reset: jest.fn(async () => { throw new Error("blocked"); }) } }));
  const secondPort = await listen(server);
  expect((await fetch(`http://127.0.0.1:${secondPort}/api/v1/node/data/reset`, { method: "POST", headers: { authorization: "Bearer root" }, body: "{}" })).status).toBe(500);
});

test("pending initialization accepts the explicit authenticated bootstrap request", async () => {
  const initialize = jest.fn().mockResolvedValue(undefined);
  const onInitialized = jest.fn();
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: "root" }, initialize, onInitialized }));
  const port = await listen(server);
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/bootstrap`, { method: "POST", headers: { authorization: "Bearer root", "content-type": "application/json" }, body: JSON.stringify({ confirm: true }) });
  expect(response.status).toBe(202);
  expect(initialize).toHaveBeenCalledTimes(1);
  await new Promise((resolve) => setImmediate(resolve));
  expect(onInitialized).toHaveBeenCalledTimes(1);
});

test("pending initialization accepts an explicit authenticated join request", async () => {
  const initialize = jest.fn().mockResolvedValue(undefined);
  const onInitialized = jest.fn();
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: "root" }, initialize, onInitialized }));
  const port = await listen(server);
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/join`, { method: "POST", headers: { authorization: "Bearer root", "content-type": "application/json" }, body: JSON.stringify({ confirm: true }) });
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ ok: true, operation: "cluster.join", status: "completed" });
  await new Promise((resolve) => setImmediate(resolve));
  expect(initialize).toHaveBeenCalledTimes(1);
  expect(onInitialized).toHaveBeenCalledWith("join");
});

test("pending initialization accepts an explicit authenticated standalone initialization request", async () => {
  const initialize = jest.fn().mockResolvedValue(undefined);
  const onInitialized = jest.fn();
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: "root" }, initialize, onInitialized }));
  const port = await listen(server);
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/initialization/apply`, { method: "POST", headers: { authorization: "Bearer root", "content-type": "application/json" }, body: JSON.stringify({ confirm: true }) });
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ ok: true, operation: "initialization.apply", status: "completed" });
  await new Promise((resolve) => setImmediate(resolve));
  expect(initialize).toHaveBeenCalledTimes(1);
  expect(onInitialized).toHaveBeenCalledWith("standalone-init");
});

test("pending clustered initialization selects only the first declared member for bootstrap", async () => {
  const initialize = jest.fn().mockResolvedValue(undefined);
  const onInitialized = jest.fn();
  const environment = { ROOT_TOKEN: "root", RUNTIME_NODE_NAME: "elera-0", SUPERVISOR_INTENT_JSON: JSON.stringify({ apiVersion: "elera.eliware.dev/v1alpha1", kind: "SupervisorIntent", cluster: { name: "lab", members: [{ name: "elera-0", address: "a" }, { name: "elera-1", address: "b" }, { name: "elera-2", address: "c" }] }, mariadb: { port: 3306 }, routing: { healthIntervalMs: 1000 }, drain: { queryTimeoutMs: 1 } }) };
  ({ server } = createPendingInitServer({ environment, initialize, onInitialized }));
  const port = await listen(server);
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/initialization/apply`, { method: "POST", headers: { authorization: "Bearer root", "content-type": "application/json" }, body: JSON.stringify({ confirm: true }) });
  expect(response.status).toBe(202);
  await new Promise((resolve) => setImmediate(resolve));
  expect(onInitialized).toHaveBeenCalledWith("bootstrap");
});

test("pending clustered initialization assigns non-authority members to join", async () => {
  const initialize = jest.fn().mockResolvedValue(undefined);
  const onInitialized = jest.fn();
  const environment = { ROOT_TOKEN: "root", RUNTIME_NODE_NAME: "elera-1", SUPERVISOR_INTENT_JSON: JSON.stringify({ apiVersion: "elera.eliware.dev/v1alpha1", kind: "SupervisorIntent", cluster: { name: "lab", members: [{ name: "elera-0", address: "a" }, { name: "elera-1", address: "b" }] }, mariadb: { port: 3306 }, routing: { healthIntervalMs: 1000 }, drain: { queryTimeoutMs: 1 } }) };
  ({ server } = createPendingInitServer({ environment, initialize, onInitialized }));
  const port = await listen(server);
  await fetch(`http://127.0.0.1:${port}/api/v1/initialization/apply`, { method: "POST", headers: { authorization: "Bearer root", "content-type": "application/json" }, body: JSON.stringify({ confirm: true }) });
  await new Promise((resolve) => setImmediate(resolve));
  expect(onInitialized).toHaveBeenCalledWith("join");
});

test("pending clustered initialization can derive the authority node identity", async () => {
  const initialize = jest.fn().mockResolvedValue(undefined); const onInitialized = jest.fn();
  const environment = { ROOT_TOKEN: "root", SUPERVISOR_INTENT_JSON: JSON.stringify({ apiVersion: "elera.eliware.dev/v1alpha1", kind: "SupervisorIntent", cluster: { name: "lab", members: [{ name: os.hostname(), address: "a" }, { name: "elera-1", address: "b" }] }, mariadb: { port: 3306 }, routing: { healthIntervalMs: 1000 }, drain: { queryTimeoutMs: 1 } }) };
  ({ server } = createPendingInitServer({ environment, initialize, onInitialized }));
  const port = await listen(server);
  await fetch(`http://127.0.0.1:${port}/api/v1/initialization/apply`, { method: "POST", headers: { authorization: "Bearer root", "content-type": "application/json" }, body: JSON.stringify({ confirm: true }) });
  await new Promise((resolve) => setImmediate(resolve));
  expect(onInitialized).toHaveBeenCalledWith("bootstrap");
});

test("pending initialization requires explicit confirmation and valid JSON", async () => {
  const initialize = jest.fn();
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: "root" }, initialize }));
  const port = await listen(server);
  const missing = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/bootstrap`, { method: "POST", headers: { authorization: "Bearer root" }, body: JSON.stringify({}) });
  expect(missing.status).toBe(409);
  const malformed = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/bootstrap`, { method: "POST", headers: { authorization: "Bearer root" }, body: "{" });
  expect(malformed.status).toBe(400);
  expect(initialize).not.toHaveBeenCalled();
});

test("pending initialization reports concurrent and failed operations", async () => {
  let release;
  const initialize = jest.fn(() => new Promise((resolve) => { release = resolve; }));
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: "root" }, initialize, log: { error: jest.fn() } }));
  const port = await listen(server);
  const first = fetch(`http://127.0.0.1:${port}/api/v1/cluster/bootstrap`, { method: "POST", headers: { authorization: "Bearer root", "content-type": "application/json" }, body: JSON.stringify({ confirm: true }) });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect((await fetch(`http://127.0.0.1:${port}/api/v1/cluster/bootstrap`, { method: "POST", headers: { authorization: "Bearer root", "content-type": "application/json" }, body: JSON.stringify({ confirm: true }) })).status).toBe(409);
  release();
  expect((await first).status).toBe(202);
  const failed = jest.fn().mockRejectedValue(new Error("init failed"));
  await close(server);
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: "root" }, initialize: failed, log: { error: jest.fn() } }));
  const secondPort = await listen(server);
  expect((await fetch(`http://127.0.0.1:${secondPort}/api/v1/cluster/bootstrap`, { method: "POST", headers: { authorization: "Bearer root", "content-type": "application/json" }, body: JSON.stringify({ confirm: true }) })).status).toBe(500);
  expect((await fetch(`http://127.0.0.1:${secondPort}/other`)).status).toBe(503);
});

test("pending initialization logs a failed handoff after responding", async () => {
  const log = { error: jest.fn() };
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: "root" }, initialize: jest.fn().mockResolvedValue(undefined), onInitialized: jest.fn().mockRejectedValue(new Error("handoff failed")), log }));
  const port = await listen(server);
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/bootstrap`, { method: "POST", headers: { authorization: "Bearer root", "content-type": "application/json" }, body: JSON.stringify({ confirm: true }) });
  expect(response.status).toBe(202);
  await new Promise((resolve) => setImmediate(resolve));
  expect(log.error).toHaveBeenCalledWith("Pending initialization handoff failed", expect.anything());
});
