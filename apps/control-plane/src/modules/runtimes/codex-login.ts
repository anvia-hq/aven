import { z } from "zod";

import { ForbiddenError, orNotFound, UnavailableError } from "../../errors";
import { LOCAL_RUNTIME_ID, runtimesService } from "./service";
import type { RuntimeHub } from "./hub";
import type { CodexLoginAction, CodexLoginState } from "@aven/protocol/types";

const CALL_MS = 20_000;

const state = z.object({
  state: z.enum(["signed-in", "signed-out", "waiting", "failed", "unavailable"]),
  url: z
    .string()
    .max(500)
    .refine((url) => url.startsWith("https://auth.openai.com/"))
    .optional(),
  code: z.string().max(40).optional(),
  error: z.string().max(500).optional(),
});

export const NO_CODEX =
  "This runner has no Codex: install Codex on its machine, then restart the runner.";

export async function codexLogin(
  hub: RuntimeHub,
  organizationId: string,
  userId: string,
  runtimeId: string,
  action: CodexLoginAction,
): Promise<CodexLoginState> {
  const runtime = orNotFound(
    await runtimesService.get(organizationId, runtimeId),
    "Runtime not found",
  );
  const owner =
    runtime.id === LOCAL_RUNTIME_ID ? process.env.AVEN_BUILTIN_RUNNER_OWNER : runtime.ownerId;
  if (!owner || owner !== userId) {
    throw new ForbiddenError("Only the runner's owner can sign in to Codex on it");
  }
  const runner = hub.get(runtimeId);
  if (!runner) throw new UnavailableError("The runner is offline");
  if (!runner.codex) return { state: "unavailable", error: NO_CODEX };
  return runner
    .call("codex.login", { action }, CALL_MS)
    .then((reply) => state.parse(reply))
    .catch(() => {
      throw new UnavailableError("The runner did not answer the Codex sign-in");
    });
}
