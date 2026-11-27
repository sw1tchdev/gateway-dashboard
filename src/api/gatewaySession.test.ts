import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it("resumes only this tab's gateway session after a reload and forgets it on sign-out", async () => {
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  const before = await import("./gatewaySession");
  expect(before.readGatewaySession()).toBe("");
  before.saveGatewaySession("test-session");
  vi.resetModules();
  const after = await import("./gatewaySession");
  expect(after.readGatewaySession()).toBe("test-session");
  after.saveGatewaySession("");
  vi.resetModules();
  expect((await import("./gatewaySession")).readGatewaySession()).toBe("");
  expect(values.size).toBe(0);
});

it("preserves in-page navigation when tab storage is unavailable", async () => {
  const unavailable = () => { throw new Error("Storage disabled"); };
  vi.stubGlobal("sessionStorage", { getItem: unavailable, setItem: unavailable, removeItem: unavailable });
  const session = await import("./gatewaySession");
  session.saveGatewaySession("test-session");
  expect(session.readGatewaySession()).toBe("test-session");
  session.saveGatewaySession("");
  expect(session.readGatewaySession()).toBe("");
});
