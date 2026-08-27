import { expect, jest, test } from "@jest/globals";
import { createClusterHandoff } from "../../../src/lifecycle/pending-init/handoff.mjs";

test("cluster handoff disables pending data initialization and enables one-shot Galera bootstrap", async () => {
  const child = { once: jest.fn((event, callback) => { if (event === "exit") callback(0, null); }) };
  const spawnProcess = jest.fn(() => child);
  const exit = jest.fn();
  await createClusterHandoff({ environment: { ROOT_TOKEN: "secret" }, spawnProcess, exit })();
  expect(spawnProcess).toHaveBeenCalledWith("/usr/local/bin/mariadb-entrypoint.sh", expect.objectContaining({
    env: expect.objectContaining({ ELERA_PENDING_INIT: "false", ELERA_BOOTSTRAP: "false", ELERA_CLUSTER_BOOTSTRAP: "true" }),
    stdio: "inherit",
  }));
  expect(exit).toHaveBeenCalledWith(0);
});

test("cluster handoff maps a terminating signal to a failure exit", async () => {
  const child = { once: jest.fn((event, callback) => { if (event === "exit") callback(null, "SIGTERM"); }) };
  const exit = jest.fn();
  await createClusterHandoff({ spawnProcess: () => child, exit })();
  expect(exit).toHaveBeenCalledWith(1);
});

test("cluster handoff rejects when the child cannot start", async () => {
  const child = { once: jest.fn((event, callback) => { if (event === "error") callback(new Error("spawn failed")); }) };
  await expect(createClusterHandoff({ spawnProcess: () => child })()).rejects.toThrow("spawn failed");
});

test("cluster handoff treats an exit without code or signal as success", async () => {
  const child = { once: jest.fn((event, callback) => { if (event === "exit") callback(null, null); }) };
  const exit = jest.fn();
  const onExit = jest.fn();
  await createClusterHandoff({ spawnProcess: () => child, exit, onExit })();
  expect(onExit).toHaveBeenCalledWith(0, null);
  expect(exit).toHaveBeenCalledWith(0);
});

test("cluster handoff provides safe defaults for optional callbacks", async () => {
  const child = { once: jest.fn((event, callback) => { if (event === "exit") callback(0, null); }) };
  await createClusterHandoff({ spawnProcess: () => child })();
});
