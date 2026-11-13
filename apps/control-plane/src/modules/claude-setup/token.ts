import { CLAUDE_TOKEN_MISSING } from "@aven/protocol/runtime-wire";

import { UnprocessableError } from "@aven/server-kit/errors";

export class ClaudeTokenMissingError extends UnprocessableError {
  constructor() {
    super(CLAUDE_TOKEN_MISSING);
  }
}

export async function claudeTokenOf(
  ownerId: string,
  read: (userId: string) => Promise<string | undefined>,
) {
  const token = await read(ownerId);

  if (!token) throw new ClaudeTokenMissingError();

  return token;
}

export async function claudeTokenForRun(
  thread: { agentBackend?: string | null; createdBy: string },
  read: (userId: string) => Promise<string | undefined>,
) {
  if (thread.agentBackend !== "claude") return undefined;

  return claudeTokenOf(thread.createdBy, read);
}
