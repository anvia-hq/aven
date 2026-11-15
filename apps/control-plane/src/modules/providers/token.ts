import { CLAUDE_TOKEN_MISSING, CODEX_TOKEN_MISSING } from "@aven/protocol/runtime-wire";

import { UnprocessableError } from "@aven/server-kit/errors";
import { hostedBackend } from "./backends";
import { providersService } from "./service";
import type { AgentBackendKind } from "@aven/protocol/types";

export class SubscriptionTokenMissingError extends UnprocessableError {
  constructor(backend: AgentBackendKind) {
    super(backend === "claude" ? CLAUDE_TOKEN_MISSING : CODEX_TOKEN_MISSING);
  }
}

export async function requireSubscriptionToken(userId: string, backend: AgentBackendKind) {
  if (!hostedBackend(backend)) return undefined;

  const hosted = hostedBackend(backend)!;

  if (!hosted.offered()) throw new UnprocessableError(hosted.off);

  const token = await providersService.tokenFor(userId, backend);

  if (!token) throw new SubscriptionTokenMissingError(backend);

  return token;
}
