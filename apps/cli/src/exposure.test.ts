import { describe, expect, test } from "bun:test";

import { describeExposure, describeSignups } from "./exposure";

describe("describeExposure", () => {
  test("a server on this machine only is fine", () => {
    expect(describeExposure({ AVEN_BIND: "127.0.0.1", AVEN_SITE_ADDRESS: ":80" })).toEqual({
      ok: true,
      detail: "reachable from this machine only",
    });
  });

  test("a domain is HTTPS", () => {
    const report = describeExposure({
      AVEN_SITE_ADDRESS: "aven.example.com",
      AVEN_BIND: "0.0.0.0",
    });
    expect(report).toEqual({ ok: true, detail: "HTTPS for aven.example.com" });
  });

  test("a domain on a loopback bind cannot get its certificate", () => {
    const report = describeExposure({
      AVEN_SITE_ADDRESS: "aven.example.com",
      AVEN_BIND: "127.0.0.1",
    });
    expect(report.ok).toBe(false);
    expect(report.detail).toContain("certificate");
  });

  test("plain HTTP open to a network is not private, whether empty, 0.0.0.0 or an address", () => {
    for (const bind of [undefined, "", "0.0.0.0"]) {
      const report = describeExposure({ AVEN_BIND: bind, AVEN_PORT: "2836" });
      expect(report.ok).toBe(false);
      expect(report.detail).toContain("every network");
      expect(report.detail).toContain("not encrypted");
      expect(report.detail).toContain("AVEN_BIND=127.0.0.1");
    }
    const tailnet = describeExposure({ AVEN_BIND: "100.64.0.7" });
    expect(tailnet.ok).toBe(false);
    expect(tailnet.detail).toContain("100.64.0.7");
  });
});

describe("describeSignups", () => {
  const open = describeExposure({ AVEN_BIND: "0.0.0.0" });
  const local = describeExposure({ AVEN_BIND: "127.0.0.1" });

  test("closed sign-ups are fine anywhere", () => {
    expect(describeSignups(open, { AVEN_BIND: "0.0.0.0" }, false).ok).toBe(true);
  });

  test("open sign-ups on this machine only are fine", () => {
    expect(describeSignups(local, { AVEN_BIND: "127.0.0.1" }, true).ok).toBe(true);
  });

  test("open sign-ups on a server others can reach say who would own it", () => {
    const report = describeSignups(open, { AVEN_BIND: "0.0.0.0" }, true);
    expect(report.ok).toBe(false);
    expect(report.detail).toContain("first account");
    expect(describeSignups(open, {}, true).ok).toBe(false);
    expect(
      describeSignups(
        describeExposure({ AVEN_SITE_ADDRESS: "a.example.com" }),
        { AVEN_SITE_ADDRESS: "a.example.com" },
        true,
      ).ok,
    ).toBe(false);
  });
});
