import { expect, jest, test } from "@jest/globals";
import { initializePendingData, wait } from "../../../src/lifecycle/pending-init/initialize.mjs";

test("wait resolves after the requested delay", async () => { await wait(0); });

test("initialization validates, starts private MariaDB, applies SQL, and stops it", async () => {
  const calls = [];
  const child = { kill: jest.fn(), once: (event, callback) => { calls.push(event); callback(); } };
  await initializePendingData({ environment: { MARIADB_DATA_DIR: "/data", MARIADB_ROOT_PASSWORD: "secret" }, run: async (...args) => calls.push(args), start: () => child, execute: async (value) => calls.push(value), log: { info: jest.fn() }, sleep: async () => {} });
  expect(calls[0][0]).toBe("mariadb-install-db");
  expect(calls.some((value) => Array.isArray(value) && value[0] === "mariadb-admin")).toBe(true);
  expect(calls.some((value) => value?.sql?.includes("IDENTIFIED BY 'secret'"))).toBe(true);
  expect(child.kill).toHaveBeenCalledWith("SIGTERM");
});

test("initialization fails before starting MariaDB without a root password", async () => {
  const start = jest.fn();
  await expect(initializePendingData({ environment: {}, run: async () => {}, start })).rejects.toThrow("MARIADB_ROOT_PASSWORD");
  expect(start).not.toHaveBeenCalled();
});

test("initialization reports a MariaDB readiness timeout", async () => {
  const start = () => ({ kill: jest.fn(), once: (_event, callback) => callback() });
  await expect(initializePendingData({ environment: { MARIADB_ROOT_PASSWORD: "secret" }, run: async (command) => { if (command === "mariadb-admin") throw new Error("not ready"); }, start, sleep: async () => {} })).rejects.toThrow("not ready");
});

test("initialization retries a transient MariaDB readiness failure", async () => {
  let pings = 0;
  const sleep = jest.fn().mockResolvedValue(undefined);
  const child = { kill: jest.fn(), once: (_event, callback) => callback() };
  await initializePendingData({ environment: { MARIADB_ROOT_PASSWORD: "secret" }, run: async (command) => {
    if (command === "mariadb-admin" && pings++ === 0) throw new Error("starting");
  }, start: () => child, execute: async () => {}, sleep, log: { info: jest.fn() } });
  expect(sleep).toHaveBeenCalledWith(1000);
});

test("initialization retries until the final readiness attempt", async () => {
  let pings = 0;
  const child = { kill: jest.fn(), once: (_event, callback) => callback() };
  const sleep = jest.fn().mockResolvedValue(undefined);
  await initializePendingData({ environment: { MARIADB_ROOT_PASSWORD: "secret" }, run: async (command) => {
    if (command === "mariadb-admin" && pings++ < 59) throw new Error("starting");
  }, start: () => child, execute: async () => {}, sleep, log: { info: jest.fn() } });
  expect(sleep).toHaveBeenCalledTimes(59);
});
