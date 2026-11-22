import type { RunLens } from "@aven/protocol/types";

export function resolveLens(origin: string, lens?: RunLens): RunLens | undefined {
  if (!lens) return undefined;

  return lens.baseUrl.startsWith("/") ? { ...lens, baseUrl: `${origin}${lens.baseUrl}` } : lens;
}
