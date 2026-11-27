export type DeviceMode = "rules" | "direct";

export interface GatewayStatus {
  configured: boolean;
  config_revision: string;
  last_result: string;
  devices: {
    id: string;
    name: string;
    mac: string;
    ip: string | null;
    desired_mode: DeviceMode | "unknown";
    effective_mode: DeviceMode | "unknown";
    apply_method: "restart" | "nft" | "unavailable";
  }[];
}

export interface GatewayConfig {
  text: string;
  revision: string;
}

export function sourceAddressMatches(source: string, address: string): boolean {
  return source === address || (address.includes(":")
    ? source.startsWith(`[${address}]:`)
    : source.startsWith(`${address}:`));
}

// Values from the editor can contain new credentials. Only show scalar values after server masking.
export function changedConfigPaths(before: unknown, after: unknown, masked = false, path = ""): string[] {
  function display(value: unknown) {
    if (value === null || typeof value !== "object") {
      if (typeof value === "string" && value.startsWith("__gateway_hidden_")) return "•••";
      return JSON.stringify(value);
    }
    return Array.isArray(value) ? "[…]" : "{…}";
  }
  if (before === after) return [];
  if (before === undefined) return [masked ? `+ ${path}: ${display(after)}` : `+ ${path}`];
  if (after === undefined) return [masked ? `- ${path}: ${display(before)}` : `- ${path}`];
  if (before === null || after === null || typeof before !== "object" || typeof after !== "object" ||
      Array.isArray(before) !== Array.isArray(after)) {
    return [masked ? `~ ${path}: ${display(before)} → ${display(after)}` : `~ ${path}`];
  }

  const changes: string[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const next = Array.isArray(before) ? `${path}[${key}]` : (path ? `${path}.${key}` : key);
    const left = Object.hasOwn(before, key) ? (before as Record<string, unknown>)[key] : undefined;
    const right = Object.hasOwn(after, key) ? (after as Record<string, unknown>)[key] : undefined;
    changes.push(...changedConfigPaths(left, right, masked, next));
  }
  return changes;
}

type GatewayPath = "status" | "config" | "config/check" | "config/apply" | "restart" | "rollback" | `devices/${string}`;

export async function gatewayRequest<T>(
  path: GatewayPath, token: string, data?: unknown,
  method: "GET" | "POST" | "PUT" = data === undefined ? "GET" : "POST", fetcher = fetch,
): Promise<T> {
  const response = await fetcher(`/api/gateway/${path}`, {
    method,
    mode: "same-origin",
    redirect: "error",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(`Gateway HTTP ${response.status} (JSON)`);
  }
  const payload = await response.json().catch(() => { throw new Error(`Gateway HTTP ${response.status} (JSON)`); });
  if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : `Gateway HTTP ${response.status}`);
  return payload as T;
}
