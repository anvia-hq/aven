import { CODEX_TOKEN_MISSING } from "@aven/protocol/runtime-wire";

import { UnprocessableError } from "@aven/server-kit/errors";

export class CodexTokenMissingError extends UnprocessableError {
  constructor() {
    super(CODEX_TOKEN_MISSING);
  }
}

export async function codexTokenOf(
  ownerId: string,
  read: (userId: string) => Promise<string | undefined>,
) {
  const token = await read(ownerId);

  if (!token) throw new CodexTokenMissingError();

  return token;
}
