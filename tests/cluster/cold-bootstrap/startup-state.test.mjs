import { expect, test } from "@jest/globals";
import { shouldStartMariaDb } from "../../../src/cluster/cold-bootstrap/startup-state.mjs";

test("allows standalone and only explicitly authorized local startup", () => {
  expect(shouldStartMariaDb({ elera: false, mode: "standalone" })).toBe(true);
  expect(shouldStartMariaDb({ elera: true, mode: "join", bootstrapComplete: true })).toBe(true);
  expect(shouldStartMariaDb({ elera: true, mode: "join" })).toBe(false);
  expect(shouldStartMariaDb({ elera: true, mode: "bootstrap", localWinner: true })).toBe(true);
  expect(shouldStartMariaDb({ elera: true, mode: "bootstrap" })).toBe(false);
});

test("refuses MariaDB startup for blocked cluster recovery", () => {
  expect(shouldStartMariaDb({ elera: true, mode: "blocked" })).toBe(false);
});

test("starts initialized nodes for ordinary Galera rejoin", () => {
  expect(shouldStartMariaDb({ elera: true, mode: "rejoin" })).toBe(true);
});

test("validates startup state inputs", () => {
  expect(() => shouldStartMariaDb()).toThrow("startup state requires");
});
