import { describe, expect, test } from "bun:test";

import { validUtf8 } from "./valid-utf8";

const strict = new TextDecoder("utf-8", { fatal: true });

describe("validUtf8", () => {
  test("keeps valid text as it is", () => {
    const bytes = new TextEncoder().encode("7 pass ✓ 日本語");

    expect(strict.decode(validUtf8(bytes))).toBe("7 pass ✓ 日本語");
  });

  test("drops the rest of a character a tail cut in half", () => {
    const bytes = new TextEncoder().encode("✓ ok").slice(1);

    expect(strict.decode(validUtf8(bytes))).toBe(" ok");
  });

  test("replaces bytes that are not UTF-8 so a strict decoder accepts the result", () => {
    const bytes = new Uint8Array([...new TextEncoder().encode("a"), 0xff, 0xfe, 0x62]);

    expect(strict.decode(validUtf8(bytes))).toBe("a��b");
  });

  test("replaces a character cut off at the end", () => {
    const bytes = new TextEncoder().encode("ok ✓").slice(0, -1);

    expect(strict.decode(validUtf8(bytes))).toBe("ok �");
  });

  test("returns nothing for nothing", () => {
    expect(validUtf8(new Uint8Array()).length).toBe(0);
  });
});
