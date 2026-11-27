import { describe, expect, it, vi } from "vitest";
import { changedConfigPaths, GatewayUnauthorized, gatewayRequest, sourceAddressMatches } from "./gateway";

describe("gateway", () => {
  it("never mixes an address prefix match with another device", () => {
    expect(sourceAddressMatches("192.0.2.20:4500", "192.0.2.2")).toBe(false);
    expect(sourceAddressMatches("192.0.2.2:4500", "192.0.2.2")).toBe(true);
    expect(sourceAddressMatches("[2001:db8::a]:8", "2001:db8::a")).toBe(true);
  });

  it("previews edits without any old or new secret values", () => {
    const before = { outbounds: [{ password: "old-value" }], route: { final: "direct" } };
    const after = { outbounds: [{ password: "new-value" }, { type: "direct" }], route: {} };
    expect(changedConfigPaths(before, after)).toEqual([
      "~ outbounds[0].password", "+ outbounds[1]", "- route.final",
    ]);
  });

  it("shows safe values only from the server's masked preview and hides its opaque markers", () => {
    const before = { route: { final: "direct" }, secret: "__gateway_hidden_old" };
    const after = { route: { final: "proxy" }, secret: "__gateway_hidden_new" };
    expect(changedConfigPaths(before, after, true)).toEqual([
      '~ route.final: "direct" → "proxy"', "~ secret: ••• → •••",
    ]);
  });

  it("sends authenticated same-origin requests without following redirects", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    await gatewayRequest("status", "test-admin", undefined, "GET", fetcher);
    expect(fetcher).toHaveBeenCalledWith("/api/gateway/status", expect.objectContaining({
      redirect: "error", mode: "same-origin", cache: "no-store", headers: expect.objectContaining({
        Authorization: "Bearer test-admin",
      }),
    }));
  });

  it("identifies a rejected token even when the proxy returns a non-JSON 401", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("private error details", { status: 401 }));
    await expect(gatewayRequest("status", "example-token", undefined, "GET", fetcher)).rejects.toBeInstanceOf(GatewayUnauthorized);
  });

  it("keeps the administrator credential out of errors", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: "unexpected example-token" }, { status: 503 }));
    await expect(gatewayRequest("status", "example-token", undefined, "GET", fetcher)).rejects.toThrow(/^Gateway HTTP 503$/);
  });
});
