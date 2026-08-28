import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { renderIntent } from "./render.mjs";

export function createIntentState({ stateDir }) {
  if (!stateDir) throw new TypeError("stateDir is required");
  const activePath = join(stateDir, "active.intent.json");
  const renderedPath = join(stateDir, "mariadb.cnf");
  const previousPath = join(stateDir, "last-known-good.intent.json");
  const readActive = async () => {
    try {
      return JSON.parse(await readFile(activePath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  };
  const atomicWrite = async (path, content) => {
    const temporary = `${path}.tmp-${process.pid}`;
    await writeFile(temporary, content, "utf8");
    await rename(temporary, path);
  };
  const plan = async (intent) => {
    const rendered = renderIntent(intent);
    const active = await readActive();
    if (!active)
      return {
        changed: true,
        desiredHash: rendered.hash,
        activeHash: null,
        change: "restart",
      };
    const activeHash = renderIntent(active).hash;
    if (activeHash === rendered.hash)
      return {
        changed: false,
        desiredHash: rendered.hash,
        activeHash,
        change: "no-op",
      };
    return {
      changed: true,
      desiredHash: rendered.hash,
      activeHash,
      change: "reload",
    };
  };
  const verify = async (intent) => {
    const rendered = renderIntent(intent);
    const active = await readActive();
    if (!active)
      return { ok: false, desiredHash: rendered.hash, activeHash: null };
    const activeHash = renderIntent(active).hash;
    return {
      ok: activeHash === rendered.hash,
      desiredHash: rendered.hash,
      activeHash,
    };
  };
  return {
    read: readActive,
    plan,
    async apply(intent) {
      const rendered = renderIntent(intent);
      const active = await readActive();
      await mkdir(dirname(activePath), { recursive: true });
      try {
        await (active
          ? atomicWrite(previousPath, JSON.stringify(active, null, 2))
          : Promise.resolve());
        await atomicWrite(activePath, JSON.stringify(rendered.intent, null, 2));
        await atomicWrite(renderedPath, rendered.mariadb);
      } catch (error) {
        await (active
          ? (async () => {
              try {
                await atomicWrite(activePath, JSON.stringify(active, null, 2));
              } catch {}
            })()
          : Promise.resolve());
        throw error;
      }
      return {
        ok: true,
        hash: rendered.hash,
        path: renderedPath,
        previous: Boolean(active),
      };
    },
    verify,
    paths: Object.freeze({ activePath, renderedPath, previousPath }),
  };
}
