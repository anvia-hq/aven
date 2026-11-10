import { describe, expect, test } from "bun:test";

import { charKeysym, keyChord, needsShift } from "./rfb-keys";

describe("keys for a macOS desktop", () => {
  test("letters, digits and symbols are their own keysyms, and line ends are Return and Tab", () => {
    expect([charKeysym("a"), charKeysym("7"), charKeysym("&")]).toEqual([0x61, 0x37, 0x26]);
    expect([charKeysym("\n"), charKeysym("\t")]).toEqual([0xff0d, 0xff09]);
    expect(charKeysym("é")).toBe(0xe9);
    expect(charKeysym("€")).toBe(0x01000000 + 0x20ac);
  });

  test("capitals and shifted symbols need Shift, because Apple's server does not add it", () => {
    expect(["A", "Z", "&", "?", "{"].every(needsShift)).toBe(true);
    expect(["a", "7", "-", " ", "é"].some(needsShift)).toBe(false);
  });

  test("a chord is its modifiers, then the key, and command is the key the guest remaps to Command", () => {
    expect(keyChord("ctrl+c")).toEqual({ modifiers: [0xffe3], key: 0x63 });
    expect(keyChord("cmd+shift+4")).toEqual({ modifiers: [0xffea, 0xffe1], key: 0x34 });
    expect(keyChord("Return")).toEqual({ modifiers: [], key: 0xff0d });
    expect(keyChord("alt+F4")).toEqual({ modifiers: [0xffe9], key: 0xffbd + 4 });
    expect(keyChord("opt+left")).toEqual({ modifiers: [0xffe9], key: 0xff51 });
  });

  test("refuses a key it does not know and a modifier-less chord", () => {
    expect(() => keyChord("hyperdrive")).toThrow('Unknown key "hyperdrive"');
    expect(() => keyChord("a+b")).toThrow("not a modifier");
    expect(() => keyChord("")).toThrow("No key to press");
  });
});
