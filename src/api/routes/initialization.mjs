import { access, constants } from "node:fs/promises";
import { readBody } from "../http.mjs";

export async function handleInitializationRoute({
  method,
  path,
  request,
  response,
  db,
  environment,
  dataDir,
}) {
  if (method === "GET" && path === "/api/v1/initialization") {
    let initialized = true;
    try {
      await access(`${dataDir}/mysql`, constants.F_OK);
    } catch {
      initialized = false;
    }
    response.json(200, { ok: true, initialized, dataDir });
    return true;
  }
  if (method === "POST" && path === "/api/v1/initialization/verify") {
    const [rows] = await db.query(
      "SELECT User, Host FROM mysql.user ORDER BY User, Host",
    );
    response.json(200, { ok: true, verified: true, accounts: rows });
    return true;
  }
  if (method === "POST" && path === "/api/v1/initialization/plan") {
    response.json(200, {
      ok: true,
      operation: "initialization.plan",
      changed: false,
      status: "planned",
      data: {
        database: "elera_meta",
      },
    });
    return true;
  }
  if (method === "POST" && path === "/api/v1/initialization/apply") {
    const body = await readBody(request);
    if (body.confirm !== true)
      throw Object.assign(new Error("initialization requires confirm: true"), {
        statusCode: 409,
      });
    const database = "elera_meta";
    await db.query("CREATE DATABASE IF NOT EXISTS `elera_meta`");
    await db.query("FLUSH PRIVILEGES");
    response.json(200, {
      ok: true,
      operation: "initialization.apply",
      changed: true,
      status: "completed",
      data: { database },
    });
    return true;
  }
  return false;
}
