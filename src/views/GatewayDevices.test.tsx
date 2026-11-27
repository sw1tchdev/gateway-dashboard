import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DeviceDetails, GatewayDevice, GatewayStatus } from "../api/gateway";
import { GatewayDevices, type DeviceEditor } from "./GatewayDevices";

vi.mock("../app/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

const status: GatewayStatus = { devices: [], configured: false, last_result: "", config_revision: "a" };
const details: DeviceDetails = { name: "Lab console", label: "Games", address: "00:00:5e:00:53:04", match_type: "ip_mac" };
const device: GatewayDevice = {
  ...details, id: "existing", mac: details.address, ip: "192.0.2.5", legacy: true,
  effective_mode: "rules", desired_mode: "rules", apply_method: "nft",
};

function html(view: GatewayStatus, editor: DeviceEditor | null = null) {
  return renderToStaticMarkup(<GatewayDevices status={view} editor={editor} setEditor={vi.fn()}
    busy={false} configDirty={false} connectionsAvailable onWrite={vi.fn()} onMode={vi.fn()} />);
}

describe("gateway device registry", () => {
  it("offers registration with an empty new backend while preserving the old backend's controls", () => {
    expect(html({ ...status, device_registry: true })).toContain("Add device");
    expect(html(status)).not.toContain("Add device");
    const old = html({ ...status, devices: [{ ...device, match_type: undefined, legacy: undefined }] });
    expect(old).toContain("Bypass sing-box");
    expect(old).not.toContain(">Edit</button>");
  });

  it("preserves the legacy IP and MAC match when only changing the label", () => {
    const form = { id: device.id, original: details, fields: { ...details, label: "Other games" } };
    const page = html({ ...status, devices: [device] }, form);
    expect(page).toContain('value="ip_mac" selected');
    expect(page).toContain(device.ip);
    expect(page).toContain(details.address);
    expect(page).not.toContain("The saved device changed.");
  });

  it("identifies the IP shown on a MAC rule as the current address observed on the LAN", () => {
    const macRule = { ...device, match_type: "mac" as const, legacy: false };
    const page = html({ ...status, devices: [macRule] });
    expect(page).toContain("Current IPv4 on the LAN");
    expect(page).toContain(macRule.ip);
    expect(page).not.toContain("IP and MAC addresses");
    expect(html({ ...status, devices: [{ ...macRule, ip: null }] })).not.toContain("Current IPv4 on the LAN");
  });

  it("keeps a draft and flags a concurrent change to the same device", () => {
    const view = { ...status, devices: [{ ...device, name: "Updated elsewhere" }] };
    const page = html(view, { id: device.id, original: details, fields: { ...details, label: "Local draft" } });
    expect(page).toContain("Local draft");
    expect(page).toContain("The saved device changed.");
    expect(page).toContain("Reload device details");
  });

  it("identifies overlapping records and allows clearing a requested bypass", () => {
    const other = { ...device, id: "other", name: "Other profile" };
    const page = html({ ...status, devices: [{ ...device, desired_mode: "direct",
      effective_mode: "rules", conflict: true, conflict_with: [other.id] }, other] });
    expect(page).toContain("Another device entry matches this client.");
    expect(page).toContain(" · Other profile");
    expect(page).toMatch(/<button[^>]*disabled=""[^>]*>Bypass sing-box<\/button>/);
    expect(page).toMatch(/<button(?![^>]*disabled)[^>]*>Use gateway rules<\/button>/);
  });
});
