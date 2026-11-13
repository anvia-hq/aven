import { describe, expect, test } from "bun:test";

import { previewDomain, readPreviewSettings } from "./config";

const env = (given: Record<string, string | undefined> = {}) => ({
  BETTER_AUTH_SECRET: "secret",
  ...given,
});

describe("AVEN_PREVIEW_DOMAIN", () => {
  test("is a bare domain", () => {
    expect(previewDomain("aven.run")).toBe("aven.run");
    expect(previewDomain(" Preview.Example.com. ")).toBe("preview.example.com");
  });

  test("is off when it is unset or empty", () => {
    expect(previewDomain(undefined)).toBeUndefined();
    expect(previewDomain("  ")).toBeUndefined();
  });

  test("refuses a scheme, a port or a wildcard", () => {
    for (const value of ["https://aven.run", "aven.run:8443", "*.aven.run", "aven", "aven..run"]) {
      expect(() => previewDomain(value)).toThrow("AVEN_PREVIEW_DOMAIN");
    }
  });
});

describe("the preview settings", () => {
  test("are off without a domain, and need no secret then", () => {
    const settings = readPreviewSettings({});
    expect(settings.domain).toBeUndefined();
    expect(settings.port).toBe(8001);
    expect(settings.hostname).toBe("127.0.0.1");
  });

  test("read the listener's port and address", () => {
    const settings = readPreviewSettings(
      env({
        AVEN_PREVIEW_DOMAIN: "aven.run",
        AVEN_PREVIEW_PORT: "9000",
        AVEN_PREVIEW_BIND: "0.0.0.0",
      }),
    );
    expect(settings).toMatchObject({ domain: "aven.run", port: 9000, hostname: "0.0.0.0" });
    expect(settings.secret.length).toBe(32);
  });

  test("need the server's secret to sign a ticket", () => {
    expect(() =>
      readPreviewSettings({ AVEN_PREVIEW_DOMAIN: "aven.run", BETTER_AUTH_SECRET: "" }),
    ).toThrow("BETTER_AUTH_SECRET");
  });

  test("refuse a port that is not one", () => {
    for (const port of ["0", "65536", "eight"]) {
      expect(() =>
        readPreviewSettings(env({ AVEN_PREVIEW_DOMAIN: "aven.run", AVEN_PREVIEW_PORT: port })),
      ).toThrow("AVEN_PREVIEW_PORT");
    }
  });

  test("refuse a preview host in TRUSTED_ORIGINS", () => {
    for (const origin of [
      "https://aven.run",
      "https://3000-00000000-0000-4000-8000-000000000001.aven.run",
    ]) {
      expect(() =>
        readPreviewSettings(env({ AVEN_PREVIEW_DOMAIN: "aven.run", TRUSTED_ORIGINS: origin })),
      ).toThrow("never in TRUSTED_ORIGINS");
    }
  });

  test("keep the app's own origin", () => {
    const settings = readPreviewSettings(
      env({
        AVEN_PREVIEW_DOMAIN: "aven.run",
        BETTER_AUTH_URL: "https://aven.sh",
        TRUSTED_ORIGINS: "https://aven.sh,http://localhost:5173",
      }),
    );
    expect(settings.domain).toBe("aven.run");
  });
});
