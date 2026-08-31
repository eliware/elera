import { createServer } from "node:http";
import { readBody } from "../../api/http.mjs";
import { initializePendingData } from "./initialize.mjs";
import { loadIntent } from "../../intent/model.mjs";
import { runtimeIdentity } from "../../runtime/identity.mjs";
const json = (response, status, body) => response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
export function createPendingInitServer({ environment = process.env, log = console, initialize = initializePendingData, onInitialized = () => {} } = {}) {
  let operation;
  const standaloneOperation = () => {
    const intent = loadIntent(environment);
    if (intent.cluster.members.length < 2) return "standalone-init";
    const nodeName = environment.RUNTIME_NODE_NAME ?? runtimeIdentity(environment).name;
    return intent.cluster.members[0].name === nodeName ? "bootstrap" : "join";
  };
  const authorized = (request) => Boolean(environment.ROOT_TOKEN) && request.headers.authorization === `Bearer ${environment.ROOT_TOKEN}`;
  const server = createServer(async (request, response) => {
    if (request.url === "/healthz") return response.writeHead(200, { "content-type": "text/plain" }).end("ok\n");
    if (request.url === "/readyz") return response.writeHead(503, { "content-type": "text/plain" }).end("not ready\n");
    if (request.method === "POST" && ["/api/v1/cluster/bootstrap", "/api/v1/cluster/join", "/api/v1/initialization/apply"].includes(request.url)) {
      const operationName = request.url.endsWith("/join") ? "join" : request.url.endsWith("/initialization/apply") ? standaloneOperation() : "bootstrap";
      if (!authorized(request)) return json(response, 401, { ok: false, error: "authentication required" });
      let body;
      try { body = await readBody(request); } catch (error) { return json(response, 400, { ok: false, error: error.message }); }
      if (body.confirm !== true) return json(response, 409, { ok: false, error: "explicit confirmation required" });
      if (operation) return json(response, 409, { ok: false, error: `${operationName} already in progress` });
      operation = Promise.resolve().then(() => initialize({ environment, log }));
      try {
        await operation;
        json(response, 202, { ok: true, operation: request.url.endsWith("/initialization/apply") ? "initialization.apply" : `cluster.${operationName}`, status: "completed" });
        // A handoff may replace PID 1. Wait until Node has finished the HTTP
        // response before allowing that replacement, otherwise clients can see
        // a truncated JSON body even though initialization succeeded.
        response.once("finish", () => {
          Promise.resolve().then(() => onInitialized(operationName)).catch((error) => log.error?.("Pending initialization handoff failed", { error }));
        });
      }
      catch (error) { log.error?.("Pending initialization failed", { error }); json(response, 500, { ok: false, error: error.message }); }
      finally { operation = undefined; }
      return;
    }
    json(response, 503, { ok: false, error: "pending initialization; explicit initialization required" });
  });
  return { server, initialize };
}
