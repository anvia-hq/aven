import { parseAgentContinuation } from "@anvia/core/agent/interactions";

import { ConflictError } from "../../errors";

/**
 * Reads what resumes a run that stopped on the agent's question. A runtime is not trusted, and a
 * stored continuation outlives the process that wrote it: one that does not parse is a conflict.
 */
export function parseSaved(continuation: unknown) {
  try {
    return parseAgentContinuation(continuation);
  } catch {
    throw new ConflictError("The agent's question can no longer be answered; send a new message");
  }
}
