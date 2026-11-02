import { describe, expect, test } from "bun:test";

import { isPrivateAddress, refusePrivateHost } from "./mcp-address";

describe("isPrivateAddress", () => {
  test("names the addresses a server must not be reached at unless the person said so", () => {
    for (const address of [
      "127.0.0.1",
      "127.8.8.8",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "198.18.0.1",
      "224.0.0.1",
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "ff02::1",
      // An IPv4 address written as IPv6, dotted or in hex.
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "::ffff:a9fe:a9fe",
    ]) {
      expect([address, isPrivateAddress(address)]).toEqual([address, true]);
    }
  });

  test("lets a public address through, the edges of the private ranges included", () => {
    for (const address of [
      "8.8.8.8",
      "93.184.216.34",
      "172.15.255.255",
      "172.32.0.1",
      "100.63.255.255",
      "100.128.0.1",
      "192.167.1.1",
      "198.20.0.1",
      "2606:4700:4700::1111",
      "2001:4860:4860::8888",
      "::ffff:8.8.8.8",
    ]) {
      expect([address, isPrivateAddress(address)]).toEqual([address, false]);
    }
  });
});

describe("refusePrivateHost", () => {
  const resolving = (addresses: string[]) => async () => addresses;

  test("refuses a literal address, and a name that resolves to a private one", async () => {
    await expect(refusePrivateHost("http://10.1.2.3/mcp")).rejects.toThrow("private network");
    await expect(refusePrivateHost("http://[::1]:9000/mcp")).rejects.toThrow("private network");
    await expect(
      refusePrivateHost("https://mcp.example.com/mcp", resolving(["127.0.0.1"])),
    ).rejects.toThrow("127.0.0.1");
  });

  test("refuses a name when any of its addresses is private", async () => {
    await expect(
      refusePrivateHost("https://mcp.example.com/mcp", resolving(["93.184.216.34", "10.0.0.7"])),
    ).rejects.toThrow("10.0.0.7");
  });

  test("lets a name through that resolves to public addresses only", async () => {
    await refusePrivateHost("https://mcp.example.com/mcp", resolving(["93.184.216.34"]));
    await refusePrivateHost("https://8.8.8.8/mcp");
  });

  test("refuses a name that does not resolve", async () => {
    await expect(refusePrivateHost("https://nowhere.example.com/", resolving([]))).rejects.toThrow(
      "did not resolve",
    );
    const failing = async () => {
      throw new Error("ENOTFOUND");
    };
    await expect(refusePrivateHost("https://nowhere.example.com/", failing)).rejects.toThrow(
      "did not resolve",
    );
  });
});
