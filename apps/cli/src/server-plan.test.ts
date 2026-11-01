import { describe, expect, test } from "bun:test";

import { planServer } from "./server-plan";

const base = { release: "1.0.0" };

describe("planServer", () => {
  test("is plain HTTP on 3000, with the API on 3030", () => {
    const { options, needed } = planServer(base);
    expect(options).toMatchObject({ origin: "http://localhost:3000", port: 3000, apiPort: 3030 });
    expect(options.domain).toBeUndefined();
    expect(needed).toEqual([3000, 3030]);
  });

  test("a port moves the address with it", () => {
    expect(planServer({ ...base, port: "3900" }).options.origin).toBe("http://localhost:3900");
  });

  test("a domain means HTTPS on the standard ports, both of which must be free", () => {
    const { options, needed } = planServer({ ...base, domain: "aven.example.com" });
    expect(options).toMatchObject({
      origin: "https://aven.example.com",
      port: 80,
      httpsPort: 443,
      domain: "aven.example.com",
    });
    expect(needed).toEqual([80, 3030, 443]);
  });

  test("a domain on other ports names the HTTPS port in the address", () => {
    const { options } = planServer({
      ...base,
      domain: "localhost",
      port: "8080",
      httpsPort: "8443",
    });
    expect(options.origin).toBe("https://localhost:8443");
    expect(options.port).toBe(8080);
  });

  test("an origin given wins, as behind another proxy", () => {
    expect(planServer({ ...base, origin: "https://x.dev" }).options.origin).toBe("https://x.dev");
  });

  test("refuses what is not a port or a host name", () => {
    expect(() => planServer({ ...base, port: "abc" })).toThrow("--port must be a port number");
    expect(() => planServer({ ...base, port: "70000" })).toThrow("--port");
    expect(() => planServer({ ...base, domain: "a b/c" })).toThrow("--domain must be a host name");
  });
});
