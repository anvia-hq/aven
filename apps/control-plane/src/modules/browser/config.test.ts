import { describe, expect, test } from "bun:test";

import { browserConfig } from "./config";

const base = { BETTER_AUTH_SECRET: "s" };

describe("the Browser's settings", () => {
  test("is off without an origin, on loopback and port 8001", () => {
    const config = browserConfig(base);
    expect(config.origin).toBeUndefined();
    expect(config.port).toBe(8001);
    expect(config.hostname).toBe("127.0.0.1");
    expect(config.secure).toBe(false);
  });

  test("takes the origin without a trailing slash, and is secure for https", () => {
    const config = browserConfig({
      ...base,
      AVEN_BROWSER_ORIGIN: "https://host.example:8444/",
      AVEN_BROWSER_PORT: "9000",
      AVEN_BROWSER_BIND: "0.0.0.0",
    });
    expect(config.origin).toBe("https://host.example:8444");
    expect(config.secure).toBe(true);
    expect(config.port).toBe(9000);
    expect(config.hostname).toBe("0.0.0.0");
  });

  test("refuses an origin that is not an address, and a port that is not a number", () => {
    expect(() => browserConfig({ ...base, AVEN_BROWSER_ORIGIN: "host:8444/path" })).toThrow(
      "AVEN_BROWSER_ORIGIN",
    );
    expect(() => browserConfig({ ...base, AVEN_BROWSER_PORT: "x" })).toThrow("AVEN_BROWSER_PORT");
  });

  test("signs with a key of its own, not the server's secret", () => {
    const config = browserConfig(base);
    expect(Buffer.from(config.secret).toString()).not.toBe("s");
    expect(config.secret.length).toBe(32);
  });
});
