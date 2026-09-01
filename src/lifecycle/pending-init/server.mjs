import { createServer } from "node:http";
import { readBody } from "../../api/http.mjs";
import { initializePendingData } from "./initialize.mjs";
import { loadIntent } from "../../intent/model.mjs";
import { createPendingInitAuthenticator } from './authentication.mjs';
import { handlePendingRecoveryRoute } from './recovery-routes.mjs';
import { json } from './responses.mjs';
export function createPendingInitServer({ environment = process.env, identity, log = console, initialize = initializePendingData, onInitialized = () => {}, onRecoveryBootstrap = () => {}, onRecoveryComplete = () => {}, onRecoveryJoin = () => {}, nodeDataReset, coldEvidence, recoveryRequired = false, recoveryReason = 'recovery evidence is unavailable', recoveryProtocol } = {}) {
  if (!identity?.name) throw new TypeError('runtime identity is required for pending initialization');
  const intent = loadIntent(environment, identity);
  let operation;
  const standaloneOperation = () => {
    if (intent.cluster.members.length < 2) return "standalone-init";
    const nodeName = identity?.name;
    const localMembers = intent.cluster.members.filter((member) => member.name === nodeName);
    if (localMembers.length !== 1) throw new Error(`runtime hostname ${nodeName} must match exactly one configured cluster member; configured members: ${intent.cluster.members.map((member) => member.name).join(', ')}`);
    return localMembers[0].name === intent.cluster.members[0].name ? "bootstrap" : "join-pending";
  };
  const authorized = createPendingInitAuthenticator(environment);
  const server = createServer(async (request, response) => {
    if (request.url === "/healthz") return response.writeHead(200, { "content-type": "text/plain" }).end("ok\n");
    if (request.url === "/readyz") return response.writeHead(503, { "content-type": "text/plain" }).end("not ready\n");
    if (request.method === "GET" && request.url === "/api/v1/cluster/cold-bootstrap/evidence") {
      if (!authorized(request)) return json(response, 401, { ok: false, error: "authentication required" });
      if (typeof coldEvidence !== "function") return json(response, 503, { ok: false, error: "cold bootstrap evidence is unavailable" });
      try { return json(response, 200, { ok: true, operation: "cluster.cold-bootstrap.evidence", status: "completed", data: await coldEvidence() }); }
      catch (error) { return json(response, 503, { ok: false, error: error.message }); }
    }
    if (await handlePendingRecoveryRoute({ request, response, authorized, recoveryRequired, recoveryReason, recoveryProtocol, onRecoveryBootstrap, onRecoveryComplete, onRecoveryJoin, identity, members: intent.cluster.members, log })) return;
    if (recoveryRequired && request.method === 'POST' && ['/api/v1/cluster/bootstrap', '/api/v1/initialization/apply'].includes(request.url)) {
      if (!authorized(request)) return json(response, 401, { ok: false, error: "authentication required" });
      return json(response, 503, { ok: false, error: 'cluster recovery required; initialization is not permitted', reason: recoveryReason });
    }
    if (request.method === "POST" && ["/api/v1/cluster/bootstrap", "/api/v1/cluster/join", "/api/v1/cluster/lifecycle/apply", "/api/v1/initialization/apply"].includes(request.url)) {
      if (!authorized(request)) return json(response, 401, { ok: false, error: "authentication required" });
      let body;
      try { body = await readBody(request); } catch (error) { return json(response, 400, { ok: false, error: error.message }); }
      if (recoveryRequired && request.url.endsWith("/lifecycle/apply") && body.action === "bootstrap") {
        return json(response, 503, { ok: false, error: 'cluster recovery required; initialization is not permitted', reason: recoveryReason });
      }
      if (body.confirm !== true) return json(response, 409, { ok: false, error: "explicit confirmation required" });
      let operationName;
      try {
        if (request.url.endsWith("/lifecycle/apply") && !["bootstrap", "join"].includes(body.action)) return json(response, 400, { ok: false, error: "unsupported lifecycle action" });
        operationName = request.url.endsWith("/join") || (request.url.endsWith("/lifecycle/apply") && body.action === "join") ? "join" : request.url.endsWith("/initialization/apply") ? standaloneOperation() : "bootstrap";
      } catch (error) {
        return json(response, error.statusCode ?? 400, { ok: false, error: error.message });
      }
      if (operation) return json(response, 409, { ok: false, error: `${operationName} already in progress` });
      operation = Promise.resolve().then(() => initialize({ environment, log }));
      try {
        await operation;
        json(response, 202, { ok: true, operation: request.url.endsWith("/initialization/apply") ? "initialization.apply" : `cluster.${operationName}`, status: "completed" });
        // A handoff may replace PID 1. Wait until Node has finished the HTTP
        // response before allowing that replacement, otherwise clients can see
        // a truncated JSON body even though initialization succeeded.
        response.once("finish", () => {
          if (operationName !== "join-pending") Promise.resolve().then(() => onInitialized(operationName)).catch((error) => log.error?.("Pending initialization handoff failed", { error }));
        });
      }
      catch (error) { log.error?.("Pending initialization failed", { error }); json(response, 500, { ok: false, error: error.message }); }
      finally { operation = undefined; }
      return;
    }
    if (request.method === "POST" && request.url === "/api/v1/node/data/reset") {
      if (!authorized(request)) return json(response, 401, { ok: false, error: "authentication required" });
      if (!nodeDataReset) return json(response, 503, { ok: false, error: "node data reset is unavailable before supervisor recovery is configured" });
      try { const data = await nodeDataReset.reset(await readBody(request)); return json(response, data.dryRun ? 200 : 202, { ok: true, operation: "node.data.reset", status: data.status, data }); }
      catch (error) { return json(response, error.statusCode ?? 500, { ok: false, error: error.message }); }
    }
    if (recoveryRequired) return json(response, 503, { ok: false, error: 'cluster recovery required; initialization is not permitted', reason: recoveryReason });
    json(response, 503, { ok: false, error: "pending initialization; explicit initialization required" });
  });
  return { server, initialize };
}
