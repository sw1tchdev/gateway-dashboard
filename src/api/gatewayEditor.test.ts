import { expect, it } from "vitest";
import { createGatewayEditor } from "./gatewayEditor";

const a = "__gateway_hidden_" + "a".repeat(64);
const b = "__gateway_hidden_" + "b".repeat(64);
const hidden = "Скрыто";
const invalid = "Unknown saved value.";

it("shows readable references for the original protected values, including whole objects", () => {
  const raw = JSON.stringify({ outbounds: [{ password: a }, { password: b }, { password: a }], headers: b }, null, 2);
  const editor = createGatewayEditor(raw, hidden);
  expect(editor.text).not.toContain("__gateway_hidden");
  expect(editor.text).toContain("⟦Скрыто #bbbbbbbb⟧");
  expect(editor.restore(editor.text, invalid)).toBe(raw);
  const edited = JSON.parse(editor.text);
  edited.outbounds.reverse();
  edited.outbounds[0].password = "a new credential";
  expect(JSON.parse(editor.restore(JSON.stringify(edited), invalid))).toEqual({
    outbounds: [{ password: "a new credential" }, { password: b }, { password: a }], headers: b,
  });
});

it("rejects unknown or misplaced references and leaves duplicate JSON keys for the server validator", () => {
  const raw = JSON.stringify({ password: a });
  const editor = createGatewayEditor(raw, hidden);
  expect(() => editor.restore(editor.text.replace("#aaaaaaaa", "#bbbbbbbb"), invalid)).toThrow(invalid);
  expect(() => editor.restore('{"⟦Скрыто #aaaaaaaa⟧":"x"}', invalid)).toThrow(invalid);
  expect(editor.restore('{"password":"⟦Скрыто #aaaaaaaa⟧","password":"new"}', invalid))
    .toBe('{"password":"' + a + '","password":"new"}');
  expect(editor.restore('{"password":"\\u27e6Скрыто #aaaaaaaa⟧"}', invalid)).toBe(raw);
});

it("keeps values distinct if their short identifiers collide", () => {
  const raw = JSON.stringify([a, a.slice(0, -1) + "b", a]);
  const editor = createGatewayEditor(raw, hidden);
  const [first, second, again] = JSON.parse(editor.text);
  expect(first).not.toEqual(second);
  expect(again).toEqual(first);
  expect(editor.restore(editor.text, invalid)).toBe(raw);
});
