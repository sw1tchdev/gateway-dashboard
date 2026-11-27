import { useEffect, useRef, useState, type FormEvent } from "react";
import { changedConfigPaths, gatewayRequest, type DeviceMode, type GatewayConfig, type GatewayStatus } from "../api/gateway";
import { navigate, useNavigationGuard } from "../app/context";
import { useI18n } from "../app/i18n";
import { PageHeader } from "../components/PageHeader";
import { Button, Card, DataLine } from "../components/ui";

let sessionAdmin = "";
type Result = { ok: boolean; status: GatewayStatus; preview?: string };

export function GatewayView({ connectionsAvailable, standalone = false }: { connectionsAvailable: boolean; standalone?: boolean }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [config, setConfig] = useState<GatewayConfig | null>(null);
  const [draft, setDraft] = useState("");
  const [checked, setChecked] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  useNavigationGuard(config !== null && draft !== config.text, (proceed) => {
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
    setConfig(value);
    setDraft(value.text);
    setChecked(null);
  }

  async function mutation(action: "config/apply" | "restart" | "rollback" | `devices/${string}`,
    payload: { revision: string; text?: string; mode?: DeviceMode }, needsRestart = true) {
    if (needsRestart && !window.confirm(t("This operation restarts the gateway service. Continue?"))) return;
    await perform(async () => {
      setChecked(null);
      let result: Result;
      try {
        result = await gatewayRequest<Result>(action, sessionAdmin, payload, action.startsWith("devices/") ? "PUT" : "POST");
      } catch (failure) {
        const actual = await gatewayRequest<GatewayStatus>("status", sessionAdmin).catch(() => null);
        setStatus(actual);
        throw failure;
      }
      setStatus(result.status);
      if (config && (action === "config/apply" || action === "rollback")) await loadConfig();
    });
  }

  const modeLabel = (mode: string) => mode === "rules" ? t("Use gateway rules")
    : mode === "direct" ? t("Bypass sing-box") : t("Unknown");

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
          {status.devices.map((device) => (
            <Card key={device.id} title={device.name} icon="dns">
              <DataLine label={t("IP address")} value={device.ip ?? "—"} mono />
              <DataLine label={t("Effective route")} value={modeLabel(device.effective_mode)} />
              {device.desired_mode !== device.effective_mode &&
                <DataLine label={t("Requested route")} value={modeLabel(device.desired_mode)} />}
              <p className="hint">{t("Bypassed game connections are outside the sing-box tracker.")}</p>
              {device.apply_method === "unavailable" && <p className="banner error" role="alert">{t("Device routing is unavailable. Check the gateway status before switching.")}</p>}
              {device.apply_method === "restart" && <p className="hint">{t("Changing this route requires a service restart.")}</p>}
              <div className="row-actions">
                {(["rules", "direct"] as const).map((mode) => (
                  <Button key={mode} variant={device.effective_mode === mode ? "primary" : undefined}
                    disabled={busy || device.apply_method === "unavailable" || device.effective_mode === mode || (config !== null && draft !== config.text)}
                    onClick={() => void mutation(`devices/${encodeURIComponent(device.id)}`,
                      { mode, revision: status.config_revision }, device.apply_method === "restart")}>
                    {modeLabel(mode)}
                  </Button>
                ))}
                {device.ip && connectionsAvailable && <Button onClick={() => navigate(`connections?source=${encodeURIComponent(device.ip!)}`)}>
                  {t("Show connections")}
                </Button>}
              </div>
            </Card>
          ))}
          {!status.devices.length && <p className="hint">{t("No devices are registered with this gateway.")}</p>}
          <Card title={t("Configuration")} icon="settings" actions={
            <Button size="small" disabled={busy} onClick={() => {
              if (config && draft !== config.text && !window.confirm(t("Discard gateway changes?"))) return;
              sessionAdmin = "";
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
                <label className="field">{t("Editable configuration sections")}
                  <textarea rows={16} spellCheck={false} className="input mono" style={{ height: "auto", resize: "vertical" }} value={draft} disabled={busy}
                    onChange={(event) => { setDraft(event.target.value); setChecked(null); }} />
                </label>
                <div className="row-actions">
                  <Button disabled={busy} onClick={() => void perform(async () => {
                    setChecked(null);
                    const result = await gatewayRequest<Result>("config/check", sessionAdmin, { revision: config.revision, text: draft });
                    setStatus(result.status);
                    if (typeof result.preview === "string") {
                      setChecked(changedConfigPaths(JSON.parse(config.text), JSON.parse(result.preview), true));
                    } else {
                      setChecked(changedConfigPaths(JSON.parse(config.text), JSON.parse(draft)));
                    }
                  })}>{t("Validate configuration")}</Button>
                  <Button variant="primary" disabled={busy || !checked?.length || config.revision !== status.config_revision}
                    onClick={() => void mutation("config/apply", { revision: config.revision, text: draft })}>
                    {t("Apply and restart")}
                  </Button>
                  {draft !== config.text && <Button disabled={busy} onClick={() => {
                    setDraft(config.text); setChecked(null);
                  }}>{t("Discard edits")}</Button>}
                </div>
                {checked !== null && <div role="status">
                  <p>{t("Configuration validated")}</p>
                  {checked.length > 0 && <pre>{checked.join("\n")}</pre>}
                </div>}
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
