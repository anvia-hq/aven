import { runtimesService, LOCAL_RUNTIME_ID } from "../runtimes/service";
import { InvalidSelectionError } from "./resolve-model";
import { asRecord } from "@aven/agents/values";
import { ConflictError } from "../../errors";
import type { ModelConfig } from "@aven/agents/types";

export const OTHER_PROVIDER = "Use an API-key provider for this thread.";

export async function assertOwnRunner(
  organizationId: string,
  runtimeId: string,
  model: ModelConfig | null,
  senderId: string,
) {
  if (model?.provider !== "codex") return;
  const runtime = await runtimesService.get(organizationId, runtimeId);
  const owner =
    runtimeId === LOCAL_RUNTIME_ID ? process.env.AVEN_BUILTIN_RUNNER_OWNER : runtime?.ownerId;
  if (!owner || owner !== senderId) throw new InvalidSelectionError(OTHER_PROVIDER);
}

export const isCodexContinuation = (continuation: unknown) =>
  asRecord(asRecord(continuation).state).codex === true;

export function assertSameEngine(
  continuation: unknown,
  model: ModelConfig | null,
  driving: boolean,
) {
  const asked = isCodexContinuation(continuation);
  if (asked && driving) {
    throw new ConflictError("Only the thread's creator can answer a question Codex asked");
  }
  if (asked && model?.provider !== "codex") {
    throw new ConflictError("Codex asked this question: answer it with the Codex provider");
  }
  if (!asked && model?.provider === "codex") {
    throw new ConflictError(
      "This question was not asked by Codex: answer it with its own provider",
    );
  }
}
