import { expect, jest, test } from "@jest/globals";
import { handleArtifactRoute } from "../src/api/routes/artifacts.mjs";

const request = {
  async *[Symbol.asyncIterator]() {
    yield JSON.stringify({ ciphertext: "age-encryption.org/v1/test" });
  },
};
const context = (method, path) => ({
  method,
  path,
  request,
  response: { json: jest.fn() },
  auth: { root: true },
  artifactStore: {
    list: jest.fn(async () => []),
    get: jest.fn(async (name) => ({
      name,
      ciphertext: "age-encryption.org/v1/test",
    })),
    put: jest.fn(async (name, body) => ({ name, body })),
    remove: jest.fn(async (name) => ({ name, removed: true })),
    verify: jest.fn(async (name) => ({ name, verified: true })),
  },
});
test("handles encrypted artifact list, get, put, verify, and remove operations", async () => {
  for (const [method, path] of [
    ["GET", "/api/v1/secrets"],
    ["GET", "/api/v1/secrets/a%20b"],
    ["PUT", "/api/v1/secrets/a"],
    ["POST", "/api/v1/secrets/a/verify"],
    ["DELETE", "/api/v1/secrets/a"],
  ])
    expect(await handleArtifactRoute(context(method, path))).toBe(true);
});
test("ignores unavailable and unrelated artifact routes", async () => {
  expect(await handleArtifactRoute(context("GET", "/other"))).toBe(false);
  expect(
    await handleArtifactRoute({
      ...context("GET", "/api/v1/secrets"),
      artifactStore: undefined,
    }),
  ).toBe(false);
  expect(await handleArtifactRoute(context("PATCH", "/api/v1/secrets/a"))).toBe(
    false,
  );
  expect(await handleArtifactRoute(context("GET", "/api/v1/secrets/a/b"))).toBe(
    false,
  );
});
test("rejects artifact operations without the required scope", async () => {
  expect(
    await handleArtifactRoute({
      ...context("GET", "/api/v1/secrets"),
      auth: { scopes: [] },
    }),
  ).toBe(false);
  expect(
    await handleArtifactRoute({
      ...context("DELETE", "/api/v1/secrets/a"),
      auth: { scopes: ["backup:read"] },
    }),
  ).toBe(false);
  expect(await handleArtifactRoute({ ...context("GET", "/api/v1/secrets/a"), auth: { scopes: [] } })).toBe(false);
  expect(await handleArtifactRoute({ ...context("POST", "/api/v1/secrets/a/verify"), auth: { scopes: [] } })).toBe(false);
  expect(await handleArtifactRoute({ ...context("PUT", "/api/v1/secrets/a"), auth: { scopes: [] } })).toBe(false);
});
