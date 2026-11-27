const key = "sing-box-dashboard.gateway-session";
let current: string | undefined;

export function readGatewaySession(): string {
  if (current === undefined) {
    try {
      current = sessionStorage.getItem(key) ?? "";
    } catch {
      current = "";
    }
  }
  return current;
}

export function saveGatewaySession(token: string) {
  current = token;
  try {
    if (token) sessionStorage.setItem(key, token);
    else sessionStorage.removeItem(key);
  } catch {
    // Browsers that block storage still retain the session during dashboard navigation.
  }
}
