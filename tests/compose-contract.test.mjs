import { readFile } from "node:fs/promises";
import { test, expect } from "@jest/globals";

test("Compose lab disables implicit bootstrap for every Elera service", async () => {
  const compose = await readFile(new URL("../compose.yaml", import.meta.url), "utf8");
  expect((compose.match(/ELERA_BOOTSTRAP: "false"/g) ?? []).length).toBe(4);
  expect(compose).not.toContain('ELERA_BOOTSTRAP: "true"');
});

test("Compose lab keeps every member pending for explicit initialization", async () => {
  const compose = await readFile(new URL("../compose.yaml", import.meta.url), "utf8");
  expect((compose.match(/ELERA_PENDING_INIT: "true"/g) ?? []).length).toBe(4);
});
