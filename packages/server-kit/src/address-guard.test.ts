import { describe, expect, test } from "bun:test";

import {
  allowedProviderHosts,
  assertPublicProviderUrl,
  assertProviderAddress,
  ProviderAddressError,
} from "./address-guard";

const resolvesTo =
  (...addresses: string[]) =>
  async () =>
    addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));

const none = new Set<string>();

describe("assertPublicProviderUrl", () => {
  test("refuses loopback, private, link-local and metadata addresses given as literals", async () => {
    for (const url of [
      "http://127.0.0.1:11434/v1",
      "http://169.254.169.254/latest/meta-data",
      "http://10.1.2.3/v1",
      "http://172.16.0.9/v1",
      "http://192.168.1.1/v1",
      "http://100.64.0.1/v1",
      "http://0.0.0.0/v1",
      "http://[::1]/v1",
      "http://[fe80::1]/v1",
      "http://[fc00::1]/v1",
      "http://[::ffff:127.0.0.1]/v1",
      "http://[::ffff:a9fe:a9fe]/v1",
    ]) {
      await expect(assertPublicProviderUrl(url, { allowed: none })).rejects.toBeInstanceOf(
        ProviderAddressError,
      );
    }
  });

  test("refuses a host name that resolves to an internal address, even when one of several does", async () => {
    await expect(
      assertPublicProviderUrl("https://models.example.com/v1", {
        allowed: none,
        resolve: resolvesTo("10.0.0.5"),
      }),
    ).rejects.toBeInstanceOf(ProviderAddressError);
    await expect(
      assertPublicProviderUrl("https://models.example.com/v1", {
        allowed: none,
        resolve: resolvesTo("93.184.216.34", "127.0.0.1"),
      }),
    ).rejects.toBeInstanceOf(ProviderAddressError);
  });

  test("refuses a host name that does not resolve", async () => {
    await expect(
      assertPublicProviderUrl("https://nowhere.example/v1", {
        allowed: none,
        resolve: async () => {
          throw new Error("ENOTFOUND");
        },
      }),
    ).rejects.toBeInstanceOf(ProviderAddressError);
  });

  test("accepts public addresses and public host names", async () => {
    await assertPublicProviderUrl("https://api.example.com/v1", {
      allowed: none,
      resolve: resolvesTo("93.184.216.34", "2606:2800:220:1::1"),
    });
    await assertPublicProviderUrl("http://93.184.216.34/v1", { allowed: none });
  });

  test("lets a host the server owner allowed through, without resolving it", async () => {
    await assertPublicProviderUrl("http://localhost:11434/v1", {
      allowed: new Set(["localhost"]),
      resolve: async () => {
        throw new Error("must not resolve an allowed host");
      },
    });
    await expect(
      assertPublicProviderUrl("http://127.0.0.1:11434/v1", {
        allowed: new Set(["localhost"]),
      }),
    ).rejects.toBeInstanceOf(ProviderAddressError);
  });
});

describe("assertProviderAddress", () => {
  test("checks only the kinds whose base URL a person types", async () => {
    await expect(
      assertProviderAddress("openai-compatible", "http://127.0.0.1/v1/models"),
    ).rejects.toBeInstanceOf(ProviderAddressError);
    await expect(
      assertProviderAddress("azure", "http://169.254.169.254/openai/deployments"),
    ).rejects.toBeInstanceOf(ProviderAddressError);
    await assertProviderAddress("anthropic", "http://127.0.0.1/v1/models");
  });
});

describe("allowedProviderHosts", () => {
  test("reads PROVIDER_ALLOWED_HOSTS as lower-case host names", () => {
    expect(
      allowedProviderHosts({ PROVIDER_ALLOWED_HOSTS: " Ollama.internal, localhost ,," }),
    ).toEqual(new Set(["ollama.internal", "localhost"]));
    expect(allowedProviderHosts({})).toEqual(new Set());
  });
});
