import { UnavailableError } from "@aven/server-kit/errors";

import { SpacesApiError, type SpacesClient } from "./client";
import type { SandboxRecord } from "../types";

export async function stopSpacesSandbox(record: SandboxRecord, client: SpacesClient) {
  if (!record.sandboxId) return;

  try {
    const sandbox = await client.getSandbox(record.apiKey, record.sandboxId);

    if (sandbox.state === "archived" || sandbox.state === "cancelled") return;

    await client.stop(record.apiKey, record.sandboxId);
  } catch (error) {
    if (!(error instanceof SpacesApiError))
      throw new UnavailableError("Could not reach the spaces server");

    if ([401, 403, 404, 409].includes(error.status)) {
      console.error(`Could not stop spaces sandbox ${record.sandboxId}: ${error.message}`);
      return;
    }

    throw new UnavailableError(error.message);
  }
}

export async function destroySpacesSandbox(
  apiKey: string,
  sandboxId: string,
  client: SpacesClient,
) {
  try {
    await client.deleteSandbox(apiKey, sandboxId);
  } catch (error) {
    if (!(error instanceof SpacesApiError && error.status === 404)) throw error;
  }
}
