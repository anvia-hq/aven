import { UnavailableError } from "@aven/server-kit/errors";

import { LizardApiError, type LizardClient } from "./client";
import type { SandboxRecord } from "../types";

const ALREADY_STOPPED = new Set(["paused", "pausing", "stopped", "deleted", "failed"]);

export async function stopLizardSandbox(record: SandboxRecord, client: LizardClient) {
  if (!record.sandboxId) return;

  try {
    const sandbox = await client.getSandbox(record.apiKey, record.sandboxId);

    if (ALREADY_STOPPED.has(sandbox.state)) return;

    await client.pause(record.apiKey, record.sandboxId);
  } catch (error) {
    if (!(error instanceof LizardApiError))
      throw new UnavailableError("Could not reach lizard.build");

    if ([401, 403, 404, 409].includes(error.status)) {
      console.error(`Could not pause Lizard sandbox ${record.sandboxId}: ${error.message}`);
      return;
    }

    throw new UnavailableError(error.message);
  }
}

export async function destroyLizardSandbox(
  apiKey: string,
  sandboxId: string,
  client: LizardClient,
) {
  try {
    await client.deleteSandbox(apiKey, sandboxId);
  } catch (error) {
    if (!(error instanceof LizardApiError && error.status === 404)) throw error;
  }
}
