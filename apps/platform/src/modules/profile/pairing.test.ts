import { describe, expect, test } from "bun:test";

import { formatCountdown, pairingUrlOf, remainingSecondsOf } from "./pairing";

describe("mobile pairing helpers", () => {
  test("builds an aven://pair URL pointing at the instance's /api endpoint", () => {
    const raw = pairingUrlOf("https://aven.example.com/", "abc_123-XYZ");
    const parsed = new URL(raw);
    expect(parsed.protocol).toBe("aven:");
    expect(parsed.host).toBe("pair");
    expect(parsed.searchParams.get("server")).toBe("https://aven.example.com/api");
    expect(parsed.searchParams.get("code")).toBe("abc_123-XYZ");
  });

  test("computes and formats remaining countdown seconds", () => {
    const now = Date.parse("2026-11-26T10:00:00.000Z");
    expect(remainingSecondsOf("2026-11-26T10:02:00.000Z", now)).toBe(120);
    expect(remainingSecondsOf("2026-11-26T09:59:59.000Z", now)).toBe(0);
    expect(formatCountdown(120)).toBe("2:00");
    expect(formatCountdown(9)).toBe("0:09");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});
