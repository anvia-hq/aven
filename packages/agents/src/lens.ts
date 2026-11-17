import type { AgentObservabilityOptions } from "@anvia/core/observability";
import { LensClient } from "@anvia/lens";

import type { RunLens } from "@aven/protocol/types";

export const LENS_OBSERVER = "lens";

let open: { key: string; client: LensClient } | undefined;

function keyOf(lens: RunLens) {
  return [lens.baseUrl, lens.publicKey, lens.secretKey, lens.captureMode ?? "safe"].join("\n");
}

export function lensObservability(lens?: RunLens): AgentObservabilityOptions | undefined {
  if (!lens) return undefined;

  try {
    const key = keyOf(lens);

    if (open?.key !== key) {
      const replaced = open?.client;

      open = {
        key,
        client: new LensClient({
          baseUrl: lens.baseUrl,
          publicKey: lens.publicKey,
          secretKey: lens.secretKey,
          serviceName: "aven",
        }),
      };

      void replaced?.close().catch(() => undefined);
    }

    const observer = open.client.observer({ captureMode: lens.captureMode ?? "safe" });
    return { observers: { [LENS_OBSERVER]: observer }, primaryTrace: LENS_OBSERVER };
  } catch (error) {
    console.error(
      "Could not open the Anvia Lens client; the agent runs untraced:",
      error instanceof Error ? error.message : error,
    );
    return undefined;
  }
}

export async function closeLens() {
  const closing = open;
  open = undefined;
  await closing?.client.close().catch(() => undefined);
}
