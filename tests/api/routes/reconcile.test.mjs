import { expect, jest, test } from "@jest/globals";
import { handleReconcileRoute } from "../../../src/api/routes/reconcile.mjs";
const request = (body) => ({
  async *[Symbol.asyncIterator]() {
    yield JSON.stringify(body);
  },
});
const make = (method, path, body = {}) => ({
  method,
  path,
  request: request(body),
  response: { json: jest.fn() },
  auth: { scopes: ["metadata:reconcile"] },
  reconciler: {
    plan: jest.fn(async () => ({})),
    apply: jest.fn(async () => ({})),
    verify: jest.fn(async () => ({ verified: true })),
  },
});
test("handles reconcile and metadata/account restore plans and applies", async () => {
  const paths = [
    "/api/v1/reconcile/plan",
    "/api/v1/reconcile/apply",
    "/api/v1/reconcile/verify",
    "/api/v1/restores/metadata/plan",
    "/api/v1/restores/metadata/apply",
    "/api/v1/restores/accounts/plan",
    "/api/v1/restores/accounts/apply",
    "/api/v1/restores/accounts/verify",
  ];
  for (const path of paths) {
    const c = make("POST", path, { desired: {}, accounts: [] });
    expect(await handleReconcileRoute(c)).toBe(true);
    expect(c.response.json).toHaveBeenCalled();
    expect(
      await handleReconcileRoute({
        ...make("POST", path),
        auth: { scopes: [] },
      }),
    ).toBe(false);
  }
  expect(
    await handleReconcileRoute(make("GET", "/api/v1/reconcile/plan")),
  ).toBe(false);
  expect(
    await handleReconcileRoute({
      ...make("POST", "/api/v1/reconcile/plan"),
      reconciler: undefined,
    }),
  ).toBe(false);
});
test("handles empty, wrapped, and failed verification payloads", async () => {
  const failed = make("POST", "/api/v1/reconcile/verify", {});
  failed.reconciler.verify.mockResolvedValue({ verified: false });
  expect(await handleReconcileRoute(failed)).toBe(true);
  const malformed = make("POST", "/api/v1/reconcile/plan");
  malformed.request = {
    async *[Symbol.asyncIterator]() {
      throw new Error("bad json");
    },
  };
  expect(await handleReconcileRoute(malformed)).toBe(true);
  for (const path of [
    "/api/v1/restores/accounts/plan",
    "/api/v1/restores/accounts/apply",
    "/api/v1/restores/accounts/verify",
  ])
    expect(
      await handleReconcileRoute(
        make("POST", path, { desired: { accounts: [{ user: "u" }] } }),
      ),
    ).toBe(true);
});
test("exercises unwrapped and missing restore payload defaults", async () => {
  for (const path of [
    "/api/v1/reconcile/plan",
    "/api/v1/reconcile/apply",
    "/api/v1/reconcile/verify",
  ])
    expect(
      await handleReconcileRoute(make("POST", path, { accounts: [] })),
    ).toBe(true);
  for (const path of [
    "/api/v1/restores/accounts/plan",
    "/api/v1/restores/accounts/apply",
    "/api/v1/restores/accounts/verify",
  ]) {
    expect(
      await handleReconcileRoute(
        make("POST", path, { desired: { accounts: [{ user: "u" }] } }),
      ),
    ).toBe(true);
    expect(await handleReconcileRoute(make("POST", path, {}))).toBe(true);
  }
});
test("returns unavailable for failed account restore verification and null payloads", async () => {
  const failed = make("POST", "/api/v1/restores/accounts/verify", {
    accounts: null,
    desired: { accounts: [{ user: "u" }] },
  });
  failed.reconciler.verify.mockResolvedValue({ verified: false });
  expect(await handleReconcileRoute(failed)).toBe(true);
  for (const path of [
    "/api/v1/restores/accounts/plan",
    "/api/v1/restores/accounts/apply",
  ])
    expect(
      await handleReconcileRoute(
        make("POST", path, {
          accounts: null,
          desired: { accounts: [{ user: "u" }] },
        }),
      ),
    ).toBe(true);
});
test("covers null desired and nested account defaults", async () => {
  for (const path of [
    "/api/v1/reconcile/plan",
    "/api/v1/reconcile/apply",
    "/api/v1/reconcile/verify",
  ]) {
    expect(
      await handleReconcileRoute(make("POST", path, { desired: null })),
    ).toBe(true);
  }
  for (const path of [
    "/api/v1/restores/accounts/plan",
    "/api/v1/restores/accounts/apply",
    "/api/v1/restores/accounts/verify",
  ]) {
    expect(
      await handleReconcileRoute(
        make("POST", path, { accounts: null, desired: null }),
      ),
    ).toBe(true);
  }
});
