import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { ResolveHost } from "./types";

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);

  if (family === 4) return isPrivateV4(address.split(".").map(Number));

  if (family === 6) return isPrivateV6(address.toLowerCase());

  return false;
}

function isPrivateV4([a = 0, b = 0, c = 0]: number[]) {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateV6(address: string) {
  const mapped = /^(?:0{0,4}:){0,5}ffff:(.+)$/.exec(address)?.[1];

  if (mapped !== undefined) {
    if (isIP(mapped) === 4) return isPrivateV4(mapped.split(".").map(Number));

    const [high, low] = mapped.split(":").map((part) => Number.parseInt(part, 16));

    if (high !== undefined && low !== undefined) {
      return isPrivateV4([high >> 8, high & 255, low >> 8, low & 255]);
    }
  }

  return (
    address === "::" ||
    address === "::1" ||
    /^f[cd]/.test(address) ||
    /^fe[89ab]/.test(address) ||
    address.startsWith("ff")
  );
}

const resolveWithSystem: ResolveHost = async (host) =>
  (await lookup(host, { all: true })).map(({ address }) => address);

export async function refusePrivateHost(url: string, resolve: ResolveHost = resolveWithSystem) {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) === 0 ? await resolve(host).catch(() => []) : [host];

  if (addresses.length === 0) throw new Error(`MCP URL blocked: ${host} did not resolve`);

  const blocked = addresses.find(isPrivateAddress);

  if (blocked) {
    throw new Error(
      `MCP URL blocked: ${host} is on this machine or a private network (${blocked}); turn on "On my own machine or network" for a server you run yourself`,
    );
  }
}
