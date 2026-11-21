import type { AgentObservabilityOptions } from "@anvia/core/observability";
import { LensClient } from "@anvia/lens";

import type { RunLens } from "@aven/protocol/types";
import { errorMessage } from "./values";

export const LENS_OBSERVER = "lens";

const clients = new Map<string, LensClient>();

function keyOf(lens: RunLens) {
  return [lens.baseUrl, lens.publicKey, lens.secretKey].join("\n");
}

export function lensObservability(lens?: RunLens): AgentObservabilityOptions | undefined {
  if (!lens) return undefined;

  try {
    const key = keyOf(lens);
    let client = clients.get(key);

    if (!client) {
      client = new LensClient({
        baseUrl: lens.baseUrl,
        publicKey: lens.publicKey,
        secretKey: lens.secretKey,
        serviceName: "aven",
      });
      clients.set(key, client);
    }

    const observer = client.observer({ captureMode: lens.captureMode ?? "safe" });
    return { observers: { [LENS_OBSERVER]: observer }, primaryTrace: LENS_OBSERVER };
  } catch (error) {
    console.error(
      "Could not open the Anvia Lens client; the agent runs untraced:",
      errorMessage(error),
    );
    return undefined;
  }
}

export async function closeLens() {
  const closing = [...clients.values()];
  clients.clear();
  await Promise.all(closing.map((client) => client.close().catch(() => undefined)));
}
