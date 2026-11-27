import { useEffect, useRef, useState, type FormEvent } from "react";
import { changedConfigPaths, gatewayRequest, type DeviceDetails, type DeviceMode, type GatewayConfig, type GatewayStatus } from "../api/gateway";
import { navigate, useNavigationGuard } from "../app/context";
import { useI18n } from "../app/i18n";
import { createGatewayEditor } from "../api/gatewayEditor";
import { PageHeader } from "../components/PageHeader";
import { Button, Card } from "../components/ui";
import { GatewayDevices, deviceEditorDirty, type DeviceEditor } from "./GatewayDevices";

let sessionAdmin = "";
type Result = { ok: boolean; status: GatewayStatus; preview?: string };

export function GatewayView({ connectionsAvailable, standalone = false }: { connectionsAvailable: boolean; standalone?: boolean }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [config, setConfig] = useState<(GatewayConfig & ReturnType<typeof createGatewayEditor> & { original: string }) | null>(null);
  const [draft, setDraft] = useState("");
  const [checked, setChecked] = useState<{ text: string; paths: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const [deviceForm, setDeviceForm] = useState<DeviceEditor | null>(null);
  const configDirty = config !== null && draft !== config.text;
  const dirty = configDirty || deviceEditorDirty(deviceForm);

  useNavigationGuard(dirty, (proceed) => {
    if (window.confirm(t("Discard gateway changes?"))) proceed();
  });

  useEffect(() => {
    let active = true;
    if (sessionAdmin) {
      gatewayRequest<GatewayStatus>("status", sessionAdmin).then(
        (value) => { if (active) setStatus(value); },
        (failure) => { if (active) setError(String(failure)); },
      );
    }
    return () => { active = false; };
  }, []);

  async function perform(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("Gateway request failed"));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const token = String(new FormData(form).get("admin") ?? "").trim();
    await perform(async () => {
      const next = await gatewayRequest<GatewayStatus>("status", token);
      sessionAdmin = token;
      form.reset();
      setStatus(next);
    });
  }

  async function loadConfig() {
    const value = await gatewayRequest<GatewayConfig>("config", sessionAdmin);
    const editor = createGatewayEditor(value.text, t("Hidden value"));
    setConfig({ revision: value.revision, original: value.text, ...editor });
    setDraft(editor.text);
    setChecked(null);
  }

  async function mutation(action: "config/apply" | "restart" | "rollback" | "devices" | `devices/${string}`,
    payload: { revision: string; text?: string; mode?: DeviceMode } & Partial<DeviceDetails>, needsRestart = true,
    method?: "PUT" | "POST" | "DELETE") {
    if (needsRestart && !window.confirm(t("This operation restarts the gateway service. Continue?"))) return;
    await perform(async () => {
      setChecked(null);
      let result: Result;
      try {
        result = await gatewayRequest<Result>(action, sessionAdmin, payload, method ?? (action.startsWith("devices/") ? "PUT" : "POST"));
      } catch (failure) {
        const actual = await gatewayRequest<GatewayStatus>("status", sessionAdmin).catch(() => null);
        if (actual) setStatus(actual);
        throw failure;
      }
      setStatus(result.status);
      if (method) setDeviceForm(null);
      if (config && (action === "config/apply" || action === "rollback" ||
        (!configDirty && config.revision !== result.status.config_revision))) await loadConfig();
    });
  }

  return (
    <div className="page">
      <PageHeader title={t("Gateway")} back={standalone ? { label: t("Dashboard"), onClick: () => navigate("overview") } : undefined} />
      {error && <p className="banner error" role="alert">{error}</p>}
      {status === null ? (
        <Card title={t("Gateway administration")} icon="dns">
          <form onSubmit={signIn}>
            <label className="field">{t("Gateway admin token")}
              <input name="admin" type="password" className="input" required autoComplete="off" />
            </label>
            <div className="row-actions"><Button type="submit" disabled={busy}>{t("Connect")}</Button></div>
          </form>
        </Card>
      ) : (
        <>
          <GatewayDevices status={status} editor={deviceForm} setEditor={setDeviceForm} busy={busy}
            configDirty={configDirty} connectionsAvailable={connectionsAvailable}
            onMode={(device, mode) => void mutation(`devices/${encodeURIComponent(device.id)}`,
              { mode, revision: status.config_revision }, device.apply_method === "restart")}
            onWrite={(path, method, fields) => void mutation(path, { ...fields, revision: status.config_revision }, false, method)} />
          <Card title={t("Configuration")} icon="settings" actions={
            <Button size="small" disabled={busy} onClick={() => {
              if (dirty && !window.confirm(t("Discard gateway changes?"))) return;
              sessionAdmin = "";
              setDeviceForm(null);
              setStatus(null); setConfig(null); setDraft(""); setChecked(null); setError("");
            }}>{t("Sign out of gateway")}</Button>
          }>
            <p className="hint" role="status">{status.last_result}</p>
            <div className="row-actions">
              <Button disabled={busy} onClick={() => void perform(async () =>
                setStatus(await gatewayRequest<GatewayStatus>("status", sessionAdmin)))}>{t("Refresh")}</Button>
              <Button disabled={busy || (config !== null && draft !== config.text)}
                onClick={() => void perform(loadConfig)}>{t("Load configuration")}</Button>
              <Button disabled={busy || (config !== null && draft !== config.text)}
                onClick={() => void mutation("restart", { revision: status.config_revision })}>{t("Restart service")}</Button>
              <Button disabled={busy || (config !== null && draft !== config.text)}
                onClick={() => void mutation("rollback", { revision: status.config_revision })}>{t("Restore previous configuration")}</Button>
            </div>
            {config !== null && (
              <>
                <p className="hint" id="gateway-config-secrets">{t("Leave hidden values in place to keep them. To change one, replace its entire placeholder.")}</p>
                <label className="field">{t("Editable configuration sections")}
                  <textarea rows={16} spellCheck={false} aria-describedby="gateway-config-secrets" className="input mono" style={{ height: "auto", resize: "vertical" }} value={draft} disabled={busy}
                    onChange={(event) => { setDraft(event.target.value); setChecked(null); }} />
                </label>
                <div className="row-actions">
                  <Button disabled={busy} onClick={() => void perform(async () => {
                    setChecked(null);
                    const text = config.restore(draft, t("Unknown hidden value. Reload the configuration to restore its saved values."));
                    const result = await gatewayRequest<Result>("config/check", sessionAdmin, { revision: config.revision, text });
                    setStatus(result.status);
                    const masked = typeof result.preview === "string";
                    setChecked({ text, paths: changedConfigPaths(JSON.parse(config.original), JSON.parse(result.preview ?? text), masked) });
                  })}>{t("Validate configuration")}</Button>
                  <Button variant="primary" disabled={busy || !checked?.paths.length || config.revision !== status.config_revision}
                    onClick={() => checked && void mutation("config/apply", { revision: config.revision, text: checked.text })}>
                    {t("Apply and restart")}
                  </Button>
                  {draft !== config.text && <Button disabled={busy} onClick={() => {
                    setDraft(config.text); setChecked(null);
                  }}>{t("Discard edits")}</Button>}
                </div>
                {checked !== null && <div role="status">
                  <p>{t("Configuration validated")}</p>
                  {checked.paths.length > 0 && <pre>{checked.paths.join("\n")}</pre>}
                </div>}
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
