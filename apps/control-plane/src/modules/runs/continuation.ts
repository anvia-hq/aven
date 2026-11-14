import { parseAgentContinuation } from "@anvia/core/agent/interactions";

import { ConflictError } from "@aven/server-kit/errors";

export function parseSaved(continuation: unknown) {
  try {
    return parseAgentContinuation(continuation);
  } catch {
    throw new ConflictError("The agent's question can no longer be answered; send a new message");
  }
}
