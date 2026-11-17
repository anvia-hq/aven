import { providerBackend } from "@aven/protocol/providers";
import { providersService } from "./service";
import type { AgentBackendKind } from "@aven/protocol/types";
import type { ModelSelection, ThreadModel } from "./types";

export async function selectionForThread(
  ownerId: string,
  backend: AgentBackendKind,
  selection: ModelSelection,
): Promise<ModelSelection> {
  if (!selection.providerId) return selection;

  const row = await providersService.forRun(ownerId, selection.providerId);

  return row && providerBackend(row.kind) === backend ? selection : {};
}

function withThreadChoice(thread: ThreadModel, requested: ModelSelection): ModelSelection {
  if (requested.providerId || !thread.modelProviderId) return requested;

  return {
    providerId: thread.modelProviderId,
    modelId: requested.modelId ?? thread.modelId ?? undefined,
    reasoningEffort: requested.reasoningEffort ?? thread.reasoningEffort ?? undefined,
  };
}

export async function selectionForRun(
  ownerId: string,
  thread: ThreadModel,
  requested: ModelSelection,
): Promise<ModelSelection> {
  const chosen = await selectionForThread(
    ownerId,
    thread.agentBackend,
    withThreadChoice(thread, requested),
  );

  if (chosen.providerId || thread.agentBackend !== "native") return chosen;

  const row = await providersService.forNativeRun(ownerId, undefined);

  return row ? { ...chosen, providerId: row.id } : chosen;
}
