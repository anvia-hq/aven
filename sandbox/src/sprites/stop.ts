import { UnavailableError } from "@aven/server-kit/errors";

import { SPRITES_STOP_COMMAND } from "./boot";
import { SpritesApiError, type SpritesClient } from "./client";
import type { SandboxRecord } from "../types";

const STOP_TIMEOUT_MS = 60_000;

export async function stopSpritesSandbox(record: SandboxRecord, client: SpritesClient) {
  if (!record.sandboxId) return;

  try {
    await client.run(record.apiKey, record.sandboxId, SPRITES_STOP_COMMAND, {
      timeoutMs: STOP_TIMEOUT_MS,
    });
  } catch (error) {
    if (!(error instanceof SpritesApiError))
      throw new UnavailableError("Could not reach api.sprites.dev");

    if ([401, 403, 404, 409].includes(error.status)) {
      console.error(`Could not stop the Sprite ${record.sandboxId}: ${error.message}`);
      return;
    }

    throw new UnavailableError(error.message);
  }
}

export async function destroySpritesSandbox(
  apiKey: string,
  sandboxId: string,
  client: SpritesClient,
) {
  try {
    await client.remove(apiKey, sandboxId);
  } catch (error) {
    if (!(error instanceof SpritesApiError && error.status === 404)) throw error;
  }
}
