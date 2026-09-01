import { expect, test } from "@jest/globals";
import { explicitStartupDecision } from "../../../src/cluster/cold-bootstrap/explicit-startup.mjs";

test("creates an explicit bootstrap decision for the handoff node", () => {
  expect(explicitStartupDecision({ ELERA_EXPLICIT_START_MODE: "bootstrap" }, "elera-0.example.test")).toMatchObject({ mode: "bootstrap", localWinner: true, winner: "elera-0.example.test" });
});

test("creates an explicit join decision with bootstrap authority", () => {
  expect(explicitStartupDecision({ ELERA_EXPLICIT_START_MODE: "join" }, "elera-1.example.test")).toMatchObject({ mode: "join", localWinner: false, bootstrapComplete: true });
});

test("ignores ordinary startup without an explicit handoff", () => {
  expect(explicitStartupDecision({}, "elera-0.example.test")).toBeUndefined();
});

test("rejects unknown explicit modes", () => {
  expect(() => explicitStartupDecision({ ELERA_EXPLICIT_START_MODE: "recover" }, "elera-0.example.test")).toThrow("invalid explicit startup mode");
  expect(() => explicitStartupDecision({ ELERA_EXPLICIT_START_MODE: "bootstrap" }, "elera-0")).toThrow("invalid explicit startup mode");
});
