import { UnavailableError } from "@aven/server-kit/errors";

import { boatApiKey, BoatApiError, BoatClient } from "./client";
import type { SandboxRecord } from "../types";

const STOPPED = new Set(["archived", "cancelled"]);

export async function stopBoatSandbox(record: SandboxRecord, client: BoatClient) {
  if (!record.sandboxId) return;

  try {
    const sandbox = await client.getSandbox(record.apiKey, record.sandboxId);

    if (STOPPED.has(sandbox.state) || sandbox.dataExpiredAt) return;

    await client.stop(record.apiKey, record.sandboxId);
  } catch (error) {
    if (!(error instanceof BoatApiError)) throw new UnavailableError("Could not reach boat.dev");

    if (
      error.status === 404 ||
      error.status === 409 ||
      error.status === 401 ||
      error.status === 403
    ) {
      console.error(`Could not stop boat sandbox ${record.sandboxId}: ${error.message}`);
      return;
    }

    throw new UnavailableError(error.message);
  }
}

export async function removeBoatSandbox(sandboxId: string, client = new BoatClient()) {
  const apiKey = boatApiKey();

  if (!apiKey) return false;

  try {
    await client.deleteSandbox(apiKey, sandboxId);
  } catch (error) {
    if (!(error instanceof BoatApiError && error.status === 404)) throw error;
  }

  return true;
}
