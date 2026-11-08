import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

import { UnprocessableError } from "../../errors";

export class ProviderAddressError extends UnprocessableError {}

type Resolve = (host: string) => Promise<{ address: string; family: number }[]>;

const internal = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  internal.addSubnet(address, prefix, "ipv4");
}
for (const [address, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  internal.addSubnet(address, prefix, "ipv6");
}

export function allowedProviderHosts(env: Record<string, string | undefined> = process.env) {
  return new Set(
    (env.PROVIDER_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter((host) => host !== ""),
  );
}

const resolveWithSystem: Resolve = (host) => lookup(host, { all: true, verbatim: true });

function isInternalAddress(address: string, family: number) {
  return internal.check(address, family === 6 ? "ipv6" : "ipv4");
}

export async function assertPublicProviderUrl(
  rawUrl: string,
  options: { allowed?: Set<string>; resolve?: Resolve } = {},
) {
  const host = new URL(rawUrl).hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  if ((options.allowed ?? allowedProviderHosts()).has(host)) return;

  const literal = isIP(host);
  let addresses: { address: string; family: number }[];
  if (literal) {
    addresses = [{ address: host, family: literal }];
  } else {
    try {
      addresses = await (options.resolve ?? resolveWithSystem)(host);
    } catch {
      throw new ProviderAddressError(`The provider's host could not be resolved (${host})`);
    }
  }
  if (addresses.length === 0) {
    throw new ProviderAddressError(`The provider's host could not be resolved (${host})`);
  }
  for (const { address, family } of addresses) {
    if (isInternalAddress(address, family)) {
      throw new ProviderAddressError(
        `The provider's address is not allowed (${host}). A server owner can allow an internal host with PROVIDER_ALLOWED_HOSTS.`,
      );
    }
  }
}

export async function assertProviderAddress(kind: string, url: string) {
  if (kind === "azure" || kind === "openai-compatible") await assertPublicProviderUrl(url);
}
