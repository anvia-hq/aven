import { describe, expect, test } from "bun:test";

import { planServer } from "./server-plan";

const base = { release: "1.0.0" };

describe("planServer", () => {
  test("is plain HTTP on 2836, with the API on 2837 and HTTPS on 2838 on this machine", () => {
    const { options, needed, notes } = planServer(base);
    expect(options).toMatchObject({
      origin: "http://localhost:2836",
      port: 2836,
      apiPort: 2837,
      httpsPort: 2838,
    });
    expect(options.domain).toBeUndefined();
    expect(needed).toEqual([2836, 2837, 2838]);
    expect(notes).toEqual([]);
  });

  test("takes the next free port for a default that is in use, and says so", () => {
    const busy = new Set([2836, 2838]);
    const { options, notes } = planServer(base, (port) => !busy.has(port));
    expect(options).toMatchObject({
      origin: "http://localhost:2839",
      port: 2839,
      apiPort: 2837,
      httpsPort: 2840,
    });
    expect(notes).toEqual([
      "Port 2836 is in use, so --port 2839 is used instead.",
      "Port 2838 is in use, so --https-port 2840 is used instead.",
    ]);
  });

  test("never gives two ports the same number", () => {
    const { options } = planServer(base, (port) => port !== 2836);
    const ports = [options.port, options.apiPort, options.httpsPort];
    expect(new Set(ports).size).toBe(3);
  });

  test("uses a port the flags name as it is, even when it is busy", () => {
    const { options, notes } = planServer({ ...base, port: "3900" }, (port) => port !== 3900);
    expect(options.port).toBe(3900);
    expect(notes.some((note) => note.includes("--port"))).toBe(false);
  });

  test("says so when the range has no free port left", () => {
    expect(() => planServer(base, () => false)).toThrow("No free port between 2836 and 2899");
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
    expect(needed).toEqual([80, 2837, 443]);
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
