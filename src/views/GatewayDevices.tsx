import type { FormEvent } from "react";
import type { DeviceDetails, DeviceMatch, DeviceMode, GatewayDevice, GatewayStatus } from "../api/gateway";
import { navigate } from "../app/context";
import { useI18n } from "../app/i18n";
import { Button, Card, DataLine } from "../components/ui";

export interface DeviceEditor {
  id: string | null;
  original: DeviceDetails;
  fields: DeviceDetails;
}

function fieldsOf(device?: GatewayDevice): DeviceDetails {
  const match = device?.match_type ?? "ip";
  return {
    name: device?.name ?? "",
    label: device?.label ?? "",
    match_type: match,
    address: device?.address ?? (match === "mac" ? device?.mac : device?.ip) ?? "",
  };
}

function equalFields(a: DeviceDetails, b: DeviceDetails) {
  return a.name === b.name && a.label === b.label && a.match_type === b.match_type && a.address === b.address;
}

export function deviceEditorDirty(editor: DeviceEditor | null) {
  return editor !== null && !equalFields(editor.fields, editor.original);
}

type DeviceWrite = (path: "devices" | `devices/${string}`, method: "POST" | "PUT" | "DELETE",
  fields?: DeviceDetails) => void;

export function GatewayDevices({ status, editor, setEditor, busy, configDirty, connectionsAvailable, onWrite, onMode }: {
  status: GatewayStatus;
  editor: DeviceEditor | null;
  setEditor: (value: DeviceEditor | null) => void;
  busy: boolean;
  configDirty: boolean;
  connectionsAvailable: boolean;
  onWrite: DeviceWrite;
  onMode: (device: GatewayDevice, mode: DeviceMode) => void;
}) {
  const { t } = useI18n();
  const registry = status.device_registry ?? status.devices.some(d => d.match_type !== undefined);
  const editingDevice = editor?.id ? status.devices.find(d => d.id === editor.id) : undefined;
  const conflict = editor !== null && editor.id !== null &&
    (!editingDevice || !equalFields(editor.original, fieldsOf(editingDevice)));
  const activeBypass = editingDevice?.effective_mode === "direct" || editingDevice?.desired_mode === "direct";
  const dirty = deviceEditorDirty(editor);
  const disabled = busy || configDirty;
  const modeLabel = (mode: string) => mode === "rules" ? t("Use gateway rules")
    : mode === "direct" ? t("Bypass sing-box") : t("Unknown");

  function open(device?: GatewayDevice) {
    const fields = fieldsOf(device);
    setEditor({ id: device?.id ?? null, fields, original: fields });
  }

  function update(fields: Partial<DeviceDetails>) {
    if (editor) setEditor({ ...editor, fields: { ...editor.fields, ...fields } });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!editor || disabled || conflict || !dirty) return;
    const fields = { ...editor.fields, name: editor.fields.name.trim(), label: editor.fields.label.trim(), address: editor.fields.address.trim() };
    if (!fields.name || !fields.address) return;
    if (editor.id === null) onWrite("devices", "POST", fields);
    else onWrite(`devices/${encodeURIComponent(editor.id)}/details`, "PUT", fields);
  }

  return <>
    {registry && !editor && <div className="row-actions">
      <Button disabled={disabled} onClick={() => open()}>{t("Add device")}</Button>
    </div>}
    {registry && editor && <Card title={editor.id === null ? t("Add device") : t("Edit device")} icon="dns">
      <form onSubmit={submit}>
        <label className="field">{t("Name")}
          <input name="deviceName" className="input" required value={editor.fields.name} disabled={busy}
            onChange={e => update({ name: e.target.value })} />
        </label>
        <label className="field">{t("Label (optional)")}
          <input name="deviceLabel" className="input" value={editor.fields.label} disabled={busy}
            onChange={e => update({ label: e.target.value })} />
        </label>
        <label className="field">{t("Identify device by")}
          <select name="deviceMatch" className="input" value={editor.fields.match_type} disabled={busy || activeBypass}
            onChange={e => {
              const match = e.target.value as DeviceMatch;
              const address = match === editor.original.match_type ? editor.original.address :
                (match === "ip" ? editingDevice?.ip : editingDevice?.mac) ?? "";
              update({ match_type: match, address });
            }}>
            {editor.original.match_type === "ip_mac" && <option value="ip_mac">{t("IP and MAC addresses")}</option>}
            <option value="ip">{t("IP address")}</option>
            <option value="mac">{t("MAC address")}</option>
          </select>
        </label>
        {editor.fields.match_type === "ip_mac" && editingDevice?.ip &&
          <DataLine label={t("IPv4 address")} value={editingDevice.ip} mono />}
        <label className="field">{editor.fields.match_type === "ip" ? t("IPv4 address") : t("MAC address")}
          <input name="deviceAddress" className="input mono" required autoComplete="off" spellCheck={false} value={editor.fields.address}
            disabled={busy || activeBypass || editor.fields.match_type === "ip_mac"} onChange={e => update({ address: e.target.value })} />
        </label>
        {activeBypass && <p className="hint">{t("Switch to gateway rules before changing the device address.")}</p>}
        {conflict && <p className="banner error" role="alert">{t("The saved device changed. Review its current details before saving.")}</p>}
        <div className="row-actions">
          <Button type="submit" variant="primary" disabled={disabled || !dirty || conflict ||
            !editor.fields.name.trim() || !editor.fields.address.trim()}>{t("Save")}</Button>
          {conflict && editingDevice && <Button disabled={busy} onClick={() => {
            if (!dirty || window.confirm(t("Discard gateway changes?"))) open(editingDevice);
          }}>{t("Reload device details")}</Button>}
          <Button disabled={busy} onClick={() => setEditor(null)}>{t("Cancel")}</Button>
        </div>
      </form>
    </Card>}
    {status.devices.map(device => (
      <Card key={device.id} title={device.name} icon="dns" actions={registry ? <>
        <Button size="small" disabled={disabled || editor !== null} onClick={() => open(device)}>{t("Edit")}</Button>
        <Button size="small" variant="danger" disabled={disabled || editor !== null} onClick={() => {
          if (window.confirm(t("Remove this device and its routing policy?") + "\n\n" + device.name))
            onWrite(`devices/${encodeURIComponent(device.id)}`, "DELETE");
        }}>{t("Delete")}</Button>
      </> : undefined}>
        {device.label && <DataLine label={t("Device label")} value={device.label} />}
        {device.match_type === "ip_mac" && <DataLine label={t("IP and MAC addresses")}
          value={`${device.ip ?? "—"} · ${device.mac ?? device.address ?? "—"}`} mono />}
        {device.match_type === "mac" && <DataLine label={t("MAC address")} value={device.address ?? device.mac ?? "—"} mono />}
        {device.match_type !== "ip_mac" && (device.match_type !== "mac" || device.ip) &&
          <DataLine label={device.match_type === "mac" ? t("Current IPv4 on the LAN") : t("IP address")}
            value={device.ip ?? device.address ?? "—"} mono />}
        <DataLine label={t("Effective route")} value={modeLabel(device.effective_mode)} />
        {device.desired_mode !== device.effective_mode &&
          <DataLine label={t("Requested route")} value={modeLabel(device.desired_mode)} />}
        {device.effective_mode === "direct" && <p className="hint">{t("Bypassed game connections are outside the sing-box tracker.")}</p>}
        {device.conflict && <p className="banner error" role="alert">
          {t("Another device entry matches this client. Gateway rules take priority. Change one of the addresses to enable bypass.")}
          {status.devices.filter(other => device.conflict_with?.includes(other.id)).map(other => <span key={other.id}> · {other.name}</span>)}
        </p>}
        {device.apply_method === "unavailable" && <p className="banner error" role="alert">{t("Device routing is unavailable. Check the gateway status before switching.")}</p>}
        {device.apply_method === "restart" && <p className="hint">{t("Changing this route requires a service restart.")}</p>}
        <div className="row-actions">
          {(["rules", "direct"] as const).map(mode => (
            <Button key={mode} variant={device.effective_mode === mode ? "primary" : undefined}
              disabled={disabled || editor !== null || device.apply_method === "unavailable" ||
                (mode === "direct" && device.conflict) || (device.effective_mode === mode && device.desired_mode === mode)}
              onClick={() => onMode(device, mode)}>{modeLabel(mode)}</Button>
          ))}
          {device.ip && connectionsAvailable && <Button onClick={() => navigate(`connections?source=${encodeURIComponent(device.ip!)}`)}>
            {t("Show connections")}</Button>}
        </div>
      </Card>
    ))}
    {!status.devices.length && !editor && <p className="hint">{t("No devices are registered with this gateway.")}</p>}
  </>;
}
