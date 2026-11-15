import { providerBackend } from "@aven/protocol/providers";
import { providersService } from "./service";
import type { AgentBackendKind } from "@aven/protocol/types";
import type { ModelSelection } from "./types";

export async function selectionForThread(
  ownerId: string,
  backend: AgentBackendKind,
  selection: ModelSelection,
): Promise<ModelSelection> {
  if (!selection.providerId) return selection;

  const row = await providersService.forRun(ownerId, selection.providerId);

  return row && providerBackend(row.kind) === backend ? selection : {};
}
