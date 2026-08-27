import { readBody } from "../http.mjs";

const allowed = (auth, scope) => auth?.root || auth?.scopes?.includes(scope);

export async function handleArtifactRoute({
  method,
  path,
  request,
  response,
  artifactStore,
  auth,
}) {
  if (!artifactStore || !path.startsWith("/api/v1/secrets")) return false;
  if (method === "GET" && path === "/api/v1/secrets") {
    if (!allowed(auth, "backup:read")) return false;
    response.json(200, {
      ok: true,
      operation: "secrets.list",
      data: await artifactStore.list(),
    });
    return true;
  }
  const match = path.match(/^\/api\/v1\/secrets\/([^/]+)(?:\/verify)?$/);
  if (!match) return false;
  const name = decodeURIComponent(match[1]);
  if (method === "GET") {
    if (!allowed(auth, "backup:read")) return false;
    response.json(200, {
      ok: true,
      operation: "secrets.get",
      data: await artifactStore.get(name),
    });
    return true;
  }
  if (method === "POST" && path.endsWith("/verify")) {
    if (!allowed(auth, "backup:read")) return false;
    response.json(200, {
      ok: true,
      operation: "secrets.verify",
      data: await artifactStore.verify(name),
    });
    return true;
  }
  if (method === "PUT") {
    if (!allowed(auth, "backup:create")) return false;
    response.json(200, {
      ok: true,
      operation: "secrets.put",
      data: await artifactStore.put(name, await readBody(request)),
    });
    return true;
  }
  if (method === "DELETE") {
    if (!allowed(auth, "backup:restore")) return false;
    response.json(200, {
      ok: true,
      operation: "secrets.delete",
      data: await artifactStore.remove(name),
    });
    return true;
  }
  return false;
}
