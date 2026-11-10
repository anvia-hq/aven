import { runtimesService, LOCAL_RUNTIME_ID } from "../runtimes/service";
import { InvalidSelectionError } from "./resolve-model";
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
