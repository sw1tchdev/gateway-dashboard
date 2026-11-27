// Replace only complete JSON string tokens, keeping duplicate keys and the user's formatting for server validation.
const strings = /"(?:[^"\\]|\\.)*"(\s*:)?/g;
const marker = /^"__gateway_hidden_([0-9a-f]{64})"$/;

export function createGatewayEditor(raw: string, label: string) {
  const originals = new Map<string, string>();
  const text = raw.replace(strings, (token, keySuffix) => {
    const digest = !keySuffix && marker.exec(token)?.[1];
    if (!digest) return token;
    let length = 8;
    let alias: string;
    do {
      alias = "⟦" + label + " #" + digest.slice(0, length++) + "⟧";
    } while (originals.has(alias) && originals.get(alias) !== token);
    originals.set(alias, token);
    return JSON.stringify(alias);
  });

  function restore(draft: string, invalid: string) {
    return draft.replace(strings, (token, keySuffix) => {
      if (!token.includes("⟦") && !token.includes("\\u")) return token;
      const value: string = JSON.parse(keySuffix ? token.slice(0, -keySuffix.length) : token);
      if (!value.startsWith("⟦") || !value.includes(" #")) return token;
      const original = originals.get(value);
      if (!original || keySuffix) throw new Error(invalid);
      return original;
    });
  }
  return { text, restore };
}
