import { expect, test } from "@jest/globals";
import { createArtifactStore } from "../../src/metadata/artifacts.mjs";

test("stores, lists, verifies, retrieves, and removes encrypted artifact metadata", async () => {
  const calls = [];
  const store = createArtifactStore({
    query: async (sql) => {
      calls.push(sql);
      if (sql.startsWith("SELECT name, kind, ciphertext"))
        return [
          [
            {
              name: "x",
              ciphertext: "age-encryption.org/v1/test",
              checksum: "bad",
            },
          ],
        ];
      if (sql.startsWith("SELECT name")) return [[{ name: "x" }]];
      return [[]];
    },
  });
  await expect(
    store.put("x", {
      ciphertext: "age-encryption.org/v1/test",
      kind: "ssh",
      keyVersion: "k1",
    }),
  ).resolves.toMatchObject({ stored: true, keyVersion: "k1" });
  await expect(store.list()).resolves.toEqual([{ name: "x" }]);
  await expect(store.verify("x")).resolves.toMatchObject({ verified: false });
  await expect(store.get("x")).resolves.toHaveProperty("name", "x");
  await expect(store.remove("x")).resolves.toEqual({
    name: "x",
    removed: true,
  });
  expect(calls.length).toBe(5);
});
test("rejects invalid names, ciphertext, missing artifacts, and dependencies", async () => {
  expect(() => createArtifactStore({})).toThrow("query function");
  const store = createArtifactStore({
    query: async (sql) => (sql.startsWith("SELECT") ? [[]] : [[]]),
  });
  await expect(store.put(" ", {})).rejects.toThrow("name");
  await expect(store.put("x", { ciphertext: "plain" })).rejects.toThrow(
    "age ciphertext",
  );
  await expect(store.get("x")).rejects.toThrow("not found");
});
