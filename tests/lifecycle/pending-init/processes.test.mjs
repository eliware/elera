import { EventEmitter } from "node:events";
import { expect, jest, test } from "@jest/globals";

const spawn = jest.fn();
jest.unstable_mockModule("node:child_process", () => ({ spawn }));
const { executeSql, runCommand, startPrivateMariaDb } = await import("../../../src/lifecycle/pending-init/processes.mjs");

const child = () => { const value = new EventEmitter(); value.stderr = new EventEmitter(); value.stdin = { end: jest.fn() }; value.kill = jest.fn(); return value; };

test("process helpers use argument arrays and handle successful commands", async () => {
  const command = child(); spawn.mockReturnValueOnce(command); const result = runCommand("tool", ["--safe"]); command.emit("exit", 0); await result;
  const server = child(); spawn.mockReturnValueOnce(server); expect(startPrivateMariaDb({ dataDir: "/data", socket: "/run/db.sock" })).toBe(server);
  const sql = child(); spawn.mockReturnValueOnce(sql); const applied = executeSql({ socket: "/run/db.sock", sql: "SELECT 1" }); sql.emit("exit", 0); await applied; expect(sql.stdin.end).toHaveBeenCalledWith("SELECT 1");
});

test("process helpers preserve command failures", async () => {
  const command = child(); spawn.mockReturnValueOnce(command); const result = runCommand("tool", []); command.stderr.emit("data", "bad"); command.emit("exit", 2); await expect(result).rejects.toThrow("tool exited with 2: bad");
  const sql = child(); spawn.mockReturnValueOnce(sql); const applied = executeSql({ socket: "s", sql: "x" }); sql.stderr.emit("data", "bad sql"); sql.emit("exit", 1); await expect(applied).rejects.toThrow("mariadb initialization failed: bad sql");
});

test("runCommand reports signal termination", async () => {
  const command = child(); spawn.mockReturnValueOnce(command);
  const result = runCommand("tool", []);
  command.emit("exit", null, "SIGTERM");
  await expect(result).rejects.toThrow("tool exited with SIGTERM");
});
