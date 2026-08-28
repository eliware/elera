import { readFile } from "node:fs/promises";
import { test, expect } from "@jest/globals";

test("Compose lab disables implicit bootstrap for every Elera service", async () => {
  const compose = await readFile(new URL("../compose.yaml", import.meta.url), "utf8");
  expect((compose.match(/SUPERVISOR_INTENT_JSON:/g) ?? []).length).toBe(3);
});

test("Compose lab keeps every member pending for explicit initialization", async () => {
  const compose = await readFile(new URL("../compose.yaml", import.meta.url), "utf8");
  expect(compose).toContain('ELERA_PENDING_INIT: "true"');
});

test("Compose lab makes fresh pending-init and health ordering explicit", async () => {
  const compose = await readFile(new URL("../compose.yaml", import.meta.url), "utf8");
  expect(compose).toContain('ELERA_BOOTSTRAP: "false"');
  expect(compose).toContain('ELERA_PENDING_INIT: "true"');
  expect(compose).toContain("condition: service_healthy");
  expect(compose).toContain("127.0.0.1:8080/healthz");
  expect(compose).not.toContain("127.0.0.1:8080/readyz");
  expect((compose.match(/ELERA_CLUSTER_SIZE: "3"/g) ?? []).length).toBe(3);
  expect(compose).toContain('ELERA_CLUSTER_SIZE: "1"');
});
