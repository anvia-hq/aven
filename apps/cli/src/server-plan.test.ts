import { describe, expect, test } from "bun:test";

import { isExposed, planServer } from "./server-plan";

const base = { release: "1.0.0" };
const owner = { ownerEmail: "me@example.com" };

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
    const { options, needed } = planServer({ ...base, ...owner, domain: "aven.example.com" });
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
      ...owner,
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

describe("who can connect (the bind address)", () => {
  test("a new install is for this machine only", () => {
    const { options, notes } = planServer(base);
    expect(options.bind).toBe("127.0.0.1");
    expect(notes).toEqual([]);
  });

  test("a domain is open to the world, which the certificate needs, with no warning of HTTP", () => {
    const { options, notes } = planServer({ ...base, ...owner, domain: "aven.example.com" });
    expect(options.bind).toBe("0.0.0.0");
    expect(notes.join(" ")).not.toContain("not encrypted");
  });

  test("--bind opens plain HTTP to a network, and says it is not encrypted", () => {
    const everyone = planServer({ ...base, ...owner, bind: "0.0.0.0" });
    expect(everyone.options.bind).toBe("0.0.0.0");
    expect(everyone.notes.join(" ")).toContain("not encrypted");
    expect(everyone.notes.join(" ")).toContain("every network");

    const tailnet = planServer({ ...base, ...owner, bind: "100.64.0.7" });
    expect(tailnet.options.bind).toBe("100.64.0.7");
    expect(tailnet.notes.join(" ")).toContain("100.64.0.7");
  });

  test("an explicit loopback address warns of nothing", () => {
    expect(planServer({ ...base, bind: "127.0.0.1" }).notes).toEqual([]);
  });

  test("refuses what is not an IPv4 address", () => {
    for (const bind of ["localhost", "::1", "999.1.1.1", "", "0.0.0.0/0"])
      expect(() => planServer({ ...base, ...owner, bind })).toThrow(
        "--bind must be an IPv4 address",
      );
  });
});

describe("a server others can reach", () => {
  test("is exposed with a domain or a bind address that is not this machine's", () => {
    expect(isExposed({})).toBe(false);
    expect(isExposed({ bind: "127.0.0.1" })).toBe(false);
    expect(isExposed({ domain: "aven.example.com" })).toBe(true);
    expect(isExposed({ bind: "0.0.0.0" })).toBe(true);
    expect(isExposed({ bind: "100.64.0.7" })).toBe(true);
  });

  test("starts with sign-ups closed, naming who can make the first account", () => {
    const { options, notes } = planServer({ ...base, ...owner, domain: "aven.example.com" });
    expect(options.registration).toBe("closed");
    expect(notes.join(" ")).toContain("only me@example.com can make the first account");
  });

  test("is refused with no owner named, since nobody could register or anybody could", () => {
    for (const input of [
      { domain: "aven.example.com" },
      { bind: "0.0.0.0" },
      { domain: "aven.example.com", ownerEmail: "  " },
    ])
      expect(() => planServer({ ...base, ...input })).toThrow("--owner-email");
  });

  test("an install for this machine stays open, with or without an owner", () => {
    expect(planServer(base).options.registration).toBe("open");
    expect(planServer({ ...base, ...owner }).options.registration).toBe("open");
  });
});
