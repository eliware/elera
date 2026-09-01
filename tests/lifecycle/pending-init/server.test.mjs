import { afterEach, expect, jest, test } from "@jest/globals";
import os from "node:os";
import { createPendingInitServer as createPendingInitServerImpl } from "../../../src/lifecycle/pending-init/server.mjs";

const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
const close = (server) => new Promise((resolve) => server.close(resolve));
const createPendingInitServer = (options = {}) => createPendingInitServerImpl({ identity: { name: "elera-0.cluster.local" }, ...options });
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

test("accepts canonical lifecycle apply join in pending mode", async () => {
  const initialize = jest.fn().mockResolvedValue(undefined); const onInitialized = jest.fn();
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: "root", SUPERVISOR_INTENT_JSON: JSON.stringify({ apiVersion: "elera.eliware.dev/v1alpha1", kind: "SupervisorIntent", cluster: { name: "lab", members: [{ name: "elera-0.cluster.local", address: "elera-0.cluster.local" }, { name: "elera-1.cluster.local", address: "elera-1.cluster.local" }] }, mariadb: { port: 3306 }, routing: { healthIntervalMs: 1000 }, drain: { queryTimeoutMs: 1 } }) }, identity: { name: "elera-1.cluster.local" }, initialize, onInitialized }));
  const port = await listen(server);
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/lifecycle/apply`, { method: "POST", headers: { authorization: "Bearer root", "content-type": "application/json" }, body: JSON.stringify({ action: "join", target: "elera-1.cluster.local", confirm: true }) });
  expect(response.status).toBe(202);
  await new Promise((resolve) => setImmediate(resolve));
  expect(initialize).toHaveBeenCalledTimes(1); expect(onInitialized).toHaveBeenCalledWith("join");
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

test('rejects an unauthorized recovery authorization request', async () => {
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: 'root' }, recoveryRequired: true, recoveryProtocol: { authorize: jest.fn() } }));
  const port = await listen(server);
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/authorize`, { method: 'POST', headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' }, body: '{}' });
  expect(response.status).toBe(401);
});

test('dispatches an authenticated recovery join handoff without initialization', async () => {
  const onRecoveryJoin = jest.fn().mockResolvedValue({ node: 'elera-1', status: 'joining' });
  const initialize = jest.fn();
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: 'root' }, recoveryRequired: true, initialize, onRecoveryJoin }));
  const port = await listen(server);
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/join`, { method: 'POST', headers: { authorization: 'Bearer root', 'content-type': 'application/json' }, body: JSON.stringify({ epoch: 4, node: 'elera-1' }) });
  expect(response.status).toBe(202);
  expect(onRecoveryJoin).toHaveBeenCalledWith({ epoch: 4, node: 'elera-1' });
  expect(initialize).not.toHaveBeenCalled();
});

test('rejects unauthorized, malformed, and failed recovery join handoffs', async () => {
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: 'root' }, recoveryRequired: true }));
  let port = await listen(server);
  expect((await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/join`, { method: 'POST' })).status).toBe(401);
  await close(server); server = undefined;
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: 'root' }, recoveryRequired: true, onRecoveryJoin: jest.fn().mockRejectedValue(Object.assign(new Error('join refused'), { statusCode: 409, code: 'JOIN_REFUSED' })) }));
  port = await listen(server);
  const malformed = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/join`, { method: 'POST', headers: { authorization: 'Bearer root', 'content-type': 'application/json' }, body: '{' });
  expect(malformed.status).toBe(400);
  const failed = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/join`, { method: 'POST', headers: { authorization: 'Bearer root', 'content-type': 'application/json' }, body: '{}' });
  expect(failed.status).toBe(409);
  expect(await failed.json()).toMatchObject({ code: 'JOIN_REFUSED' });
});

test('uses the default recovery join handoff and maps untyped failures', async () => {
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: 'root' }, recoveryRequired: true }));
  let port = await listen(server);
  const defaultResponse = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/join`, { method: 'POST', headers: { authorization: 'Bearer root', 'content-type': 'application/json' }, body: '{}' });
  expect(defaultResponse.status).toBe(202);
  await close(server); server = undefined;
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: 'root' }, recoveryRequired: true, onRecoveryJoin: jest.fn().mockRejectedValue(new Error('join failed')) }));
  port = await listen(server);
  const failed = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/join`, { method: 'POST', headers: { authorization: 'Bearer root', 'content-type': 'application/json' }, body: '{}' });
  expect(failed.status).toBe(409);
});

test("pending recovery serves authenticated cold-bootstrap evidence", async () => {
  const coldEvidence = jest.fn().mockResolvedValue({ node: "elera-2", active: false });
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: "root" }, coldEvidence }));
  const port = await listen(server);
  expect((await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-bootstrap/evidence`)).status).toBe(401);
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-bootstrap/evidence`, { headers: { authorization: "Bearer root" } });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, data: { node: "elera-2" } });
  expect(coldEvidence).toHaveBeenCalledTimes(1);
});

test("pending recovery reports unavailable or failed cold-bootstrap evidence", async () => {
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: "root" } }));
  let port = await listen(server);
  expect((await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-bootstrap/evidence`, { headers: { authorization: "Bearer root" } })).status).toBe(503);
  await close(server); server = undefined;
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: "root" }, coldEvidence: jest.fn().mockRejectedValue(new Error("not ready")) }));
  port = await listen(server);
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-bootstrap/evidence`, { headers: { authorization: "Bearer root" } });
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ ok: false, error: "not ready" });
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
  const environment = { ROOT_TOKEN: "root", SUPERVISOR_INTENT_JSON: JSON.stringify({ apiVersion: "elera.eliware.dev/v1alpha1", kind: "SupervisorIntent", cluster: { name: "lab", members: [{ name: "elera-0.cluster.local", address: "elera-0.cluster.local" }, { name: "elera-1.cluster.local", address: "elera-1.cluster.local" }, { name: "elera-2.cluster.local", address: "elera-2.cluster.local" }] }, mariadb: { port: 3306 }, routing: { healthIntervalMs: 1000 }, drain: { queryTimeoutMs: 1 } }) };
  ({ server } = createPendingInitServer({ environment, initialize, onInitialized }));
  const port = await listen(server);
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/initialization/apply`, { method: "POST", headers: { authorization: "Bearer root", "content-type": "application/json" }, body: JSON.stringify({ confirm: true }) });
  expect(response.status).toBe(202);
  await new Promise((resolve) => setImmediate(resolve));
  expect(onInitialized).toHaveBeenCalledWith("bootstrap");
});

test("pending clustered initialization leaves non-authority members pending until explicit join", async () => {
  const initialize = jest.fn().mockResolvedValue(undefined);
  const onInitialized = jest.fn();
  const environment = { ROOT_TOKEN: "root", SUPERVISOR_INTENT_JSON: JSON.stringify({ apiVersion: "elera.eliware.dev/v1alpha1", kind: "SupervisorIntent", cluster: { name: "lab", members: [{ name: "elera-0.cluster.local", address: "elera-0.cluster.local" }, { name: "elera-1.cluster.local", address: "elera-1.cluster.local" }] }, mariadb: { port: 3306 }, routing: { healthIntervalMs: 1000 }, drain: { queryTimeoutMs: 1 } }) };
  ({ server } = createPendingInitServer({ environment, initialize, onInitialized }));
  const port = await listen(server);
  await fetch(`http://127.0.0.1:${port}/api/v1/initialization/apply`, { method: "POST", headers: { authorization: "Bearer root", "content-type": "application/json" }, body: JSON.stringify({ confirm: true }) });
  await new Promise((resolve) => setImmediate(resolve));
  expect(onInitialized).not.toHaveBeenCalled();
  const join = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/join`, { method: "POST", headers: { authorization: "Bearer root", "content-type": "application/json" }, body: JSON.stringify({ confirm: true }) });
  expect(join.status).toBe(202);
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

test('initialized recovery mode exposes recovery diagnostics instead of initialization instructions', async () => {
  const recoveryProtocol = { status: jest.fn().mockResolvedValue({ phase: 'blocked' }), evidence: jest.fn().mockResolvedValue([{ node: 'elera-0' }]), plan: jest.fn().mockResolvedValue({ mode: 'join' }), retry: jest.fn().mockResolvedValue({ mode: 'join' }) };
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: 'root' }, recoveryRequired: true, recoveryReason: 'peer evidence unavailable', recoveryProtocol }));
  const port = await listen(server);
  const headers = { authorization: 'Bearer root' };
  expect(await (await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/status`, { headers })).json()).toMatchObject({ data: { phase: 'blocked' } });
  expect(await (await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/evidence`, { headers })).json()).toMatchObject({ data: [{ node: 'elera-0' }] });
  expect((await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/plan`, { method: 'POST', headers })).status).toBe(200);
  expect((await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/retry`, { method: 'POST', headers })).status).toBe(200);
  expect((await fetch(`http://127.0.0.1:${port}/unknown`)).json()).resolves.toMatchObject({ error: 'cluster recovery required; initialization is not permitted' });
});

test('initialized recovery mode blocks first-boot bootstrap and dispatches guarded recovery operations', async () => {
  const initialize = jest.fn();
  const recoveryProtocol = {
    authorize: jest.fn().mockResolvedValue({ phase: 'authorized' }),
    beginBootstrap: jest.fn().mockResolvedValue({ phase: 'bootstrapping' }),
    complete: jest.fn().mockResolvedValue({ phase: 'completed' })
  };
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: 'root' }, initialize, recoveryRequired: true, recoveryProtocol }));
  const port = await listen(server);
  const headers = { authorization: 'Bearer root', 'content-type': 'application/json' };
  const body = JSON.stringify({ node: 'elera-0', confirm: true });
  expect((await fetch(`http://127.0.0.1:${port}/api/v1/cluster/bootstrap`, { method: 'POST', headers, body })).status).toBe(503);
  expect(initialize).not.toHaveBeenCalled();
  expect((await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/authorize`, { method: 'POST', headers, body })).status).toBe(202);
  expect((await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/bootstrap`, { method: 'POST', headers, body })).status).toBe(202);
  expect((await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/complete`, { method: 'POST', headers, body })).status).toBe(202);
  expect(recoveryProtocol.authorize).toHaveBeenCalledWith(expect.objectContaining({ node: 'elera-0' }));
  expect(recoveryProtocol.beginBootstrap).toHaveBeenCalledWith(expect.objectContaining({ confirm: true }));
  expect(recoveryProtocol.complete).toHaveBeenCalledWith(expect.objectContaining({ confirm: true }));
});

test('initialized recovery mode blocks lifecycle bootstrap while preserving the join handoff', async () => {
  const initialize = jest.fn().mockResolvedValue(undefined);
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: 'root' }, initialize, recoveryRequired: true, recoveryReason: 'cold recovery required' }));
  const port = await listen(server);
  const headers = { authorization: 'Bearer root', 'content-type': 'application/json' };
  const bootstrap = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/lifecycle/apply`, { method: 'POST', headers, body: JSON.stringify({ action: 'bootstrap', confirm: true }) });
  expect(bootstrap.status).toBe(503);
  expect(initialize).not.toHaveBeenCalled();
  const join = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/lifecycle/apply`, { method: 'POST', headers, body: JSON.stringify({ action: 'join', confirm: true }) });
  expect(join.status).toBe(202);
  expect(initialize).toHaveBeenCalledTimes(1);
});

test('recovery completion invokes the runtime handoff only after the response finishes', async () => {
  const onRecoveryComplete = jest.fn();
  const recoveryProtocol = { complete: jest.fn().mockResolvedValue({ phase: 'complete', epoch: 4 }) };
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: 'root' }, recoveryRequired: true, recoveryProtocol, onRecoveryComplete }));
  const port = await listen(server);
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/complete`, { method: 'POST', headers: { authorization: 'Bearer root', 'content-type': 'application/json' }, body: JSON.stringify({ epoch: 4 }) });
  expect(response.status).toBe(202);
  await new Promise((resolve) => setImmediate(resolve));
  expect(onRecoveryComplete).toHaveBeenCalledWith({ phase: 'complete', epoch: 4 });
});

test('recovery bootstrap invokes its handoff only after protocol authorization succeeds', async () => {
  const onRecoveryBootstrap = jest.fn();
  const recoveryProtocol = { beginBootstrap: jest.fn().mockResolvedValue({ phase: 'bootstrapping', epoch: 4 }) };
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: 'root' }, recoveryRequired: true, recoveryProtocol, onRecoveryBootstrap }));
  const port = await listen(server);
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/bootstrap`, { method: 'POST', headers: { authorization: 'Bearer root', 'content-type': 'application/json' }, body: JSON.stringify({ epoch: 4, winner: 'elera-0' }) });
  expect(response.status).toBe(202);
  await new Promise((resolve) => setImmediate(resolve));
  expect(onRecoveryBootstrap).toHaveBeenCalledWith({ phase: 'bootstrapping', epoch: 4 });
});

test('recovery plan and retry return protocol failures as structured errors', async () => {
  const failure = Object.assign(new Error('peer unavailable'), { code: 'RECOVERY_EVIDENCE_UNAVAILABLE' });
  const recoveryProtocol = { plan: jest.fn().mockRejectedValue(failure), retry: jest.fn().mockRejectedValue(failure) };
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: 'root' }, recoveryRequired: true, recoveryProtocol }));
  const port = await listen(server);
  const headers = { authorization: 'Bearer root' };
  for (const path of ['plan', 'retry']) {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/${path}`, { method: 'POST', headers });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: 'peer unavailable', code: 'RECOVERY_EVIDENCE_UNAVAILABLE' });
  }
});

test('uses the conflict status for protocol errors without an explicit status code', async () => {
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: 'root' }, recoveryRequired: true, recoveryProtocol: { authorize: jest.fn().mockRejectedValue(new Error('authorization rejected')) } }));
  const port = await listen(server);
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/authorize`, { method: 'POST', headers: { authorization: 'Bearer root', 'content-type': 'application/json' }, body: '{}' });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ ok: false, error: 'authorization rejected' });
});

test('recovery control endpoints enforce authentication and protocol availability', async () => {
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: 'root' }, recoveryRequired: true, recoveryProtocol: { status: jest.fn(), evidence: jest.fn() } }));
  const port = await listen(server);
  for (const method of ['GET', 'POST']) {
    const path = method === 'GET' ? 'status' : 'plan';
    expect((await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/${path}`, { method })).status).toBe(401);
  }
  const unavailable = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/authorize`, { method: 'POST', headers: { authorization: 'Bearer root', 'content-type': 'application/json' }, body: '{' });
  expect(unavailable.status).toBe(400);
  const missing = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/plan`, { method: 'POST', headers: { authorization: 'Bearer root' } });
  expect(missing.status).toBe(503);
});

test('recovery diagnostics expose fallbacks and preserve protocol failures', async () => {
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: 'root' }, recoveryRequired: true }));
  const port = await listen(server);
  const headers = { authorization: 'Bearer root', 'content-type': 'application/json' };
  expect(await (await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/status`, { headers })).json()).toMatchObject({ data: { phase: 'blocked' } });
  expect(await (await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/evidence`, { headers })).json()).toMatchObject({ data: [] });
  expect((await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/evidence`)).status).toBe(401);
  expect((await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/plan`, { method: 'POST', headers })).status).toBe(503);
  expect((await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/authorize`, { method: 'POST', headers, body: '{}' })).status).toBe(503);

  const protocol = {
    authorize: jest.fn().mockRejectedValue(Object.assign(new Error('stale epoch'), { statusCode: 409, code: 'STALE_EPOCH' })),
    beginBootstrap: jest.fn()
  };
  await close(server);
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: 'root' }, recoveryRequired: true, recoveryProtocol: protocol }));
  const secondPort = await listen(server);
  const failure = await fetch(`http://127.0.0.1:${secondPort}/api/v1/cluster/cold-recovery/authorize`, { method: 'POST', headers, body: '{}' });
  expect(failure.status).toBe(409);
  expect(await failure.json()).toMatchObject({ code: 'STALE_EPOCH', error: 'stale epoch' });
  const unavailable = await fetch(`http://127.0.0.1:${secondPort}/api/v1/cluster/cold-recovery/complete`, { method: 'POST', headers, body: '{}' });
  expect(unavailable.status).toBe(503);
});

test('logs a recovery completion handoff failure after responding', async () => {
  const log = { error: jest.fn() };
  const recoveryProtocol = { complete: jest.fn().mockResolvedValue({ phase: 'complete' }) };
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: 'root' }, recoveryRequired: true, recoveryProtocol, onRecoveryComplete: jest.fn().mockRejectedValue(new Error('completion failed')), log }));
  const port = await listen(server);
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/complete`, { method: 'POST', headers: { authorization: 'Bearer root', 'content-type': 'application/json' }, body: '{}' });
  expect(response.status).toBe(202);
  await new Promise((resolve) => setImmediate(resolve));
  expect(log.error).toHaveBeenCalledWith('Pending recovery handoff failed', expect.anything());
});

test('covers recovery evidence failure and guarded lifecycle request branches', async () => {
  const recoveryProtocol = { evidence: jest.fn().mockRejectedValue(Object.assign(new Error('evidence failed'), { code: 'EVIDENCE_FAILED' })) };
  ({ server } = createPendingInitServer({ environment: { ROOT_TOKEN: 'root' }, recoveryRequired: true, recoveryProtocol, recoveryReason: 'recovery required' }));
  const port = await listen(server);
  const headers = { authorization: 'Bearer root', 'content-type': 'application/json' };
  const evidence = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/evidence`, { headers });
  expect(evidence.status).toBe(503);
  expect(await evidence.json()).toMatchObject({ code: 'EVIDENCE_FAILED' });
  expect((await fetch(`http://127.0.0.1:${port}/api/v1/cluster/lifecycle/apply`, { method: 'POST', headers, body: JSON.stringify({ action: 'invalid', confirm: true }) })).status).toBe(400);
  expect((await fetch(`http://127.0.0.1:${port}/api/v1/cluster/bootstrap`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(401);
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
