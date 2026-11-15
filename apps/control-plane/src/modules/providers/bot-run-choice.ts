import { isModelApi, providerBackend } from "@aven/protocol/providers";
import { claudeEffortOf } from "@aven/protocol/claude-models";
import { codexEffortOf } from "@aven/protocol/codex-models";

import { invalidBotModel, listedModels, providersService } from "./service";
import { resolveModel } from "./resolve-model";
import { requireSubscriptionToken } from "./token";
import type { AgentBackendKind } from "@aven/protocol/types";
import type { BotRunChoice, BotSettingsModel } from "./types";

const effortOf = (backend: AgentBackendKind, effort: string | undefined) => {
  if (effort === undefined) return undefined;

  if (backend === "claude") return claudeEffortOf(effort);

  if (backend === "codex") return codexEffortOf(effort);

  return undefined;
};

function checkCatalog(
  kind: Parameters<typeof listedModels>[0],
  modelId: string | null | undefined,
  reasoningEffort: string | null | undefined,
) {
  const catalog = listedModels(kind);

  if (!catalog) return;

  if (modelId && !catalog.models.includes(modelId))
    throw invalidBotModel(`${modelId} is not a model of this provider`);

  const model = modelId ?? catalog.models[0]!;
  const options = catalog.efforts[model]?.options;

  if (reasoningEffort && options && !options.includes(reasoningEffort))
    throw invalidBotModel(`This model does not take the "${reasoningEffort}" reasoning effort`);
}

export async function botRunChoice(userId: string, bot: BotSettingsModel): Promise<BotRunChoice> {
  const row = await providersService.forRun(userId, bot.providerId ?? undefined);

  if (!row) return { backend: "native" };

  if (isModelApi(row.kind)) {
    const model = await resolveModel(userId, {
      providerId: row.id,
      modelId: bot.modelId ?? undefined,
      reasoningEffort: bot.reasoningEffort ?? undefined,
    });

    return { backend: "native", model: model ?? undefined };
  }

  const backend = providerBackend(row.kind);
  const token = await requireSubscriptionToken(userId, backend);
  const modelId = bot.modelId ?? row.modelId ?? undefined;

  checkCatalog(row.kind, modelId, bot.reasoningEffort);

  return {
    backend,
    token,
    modelId,
    effort: effortOf(backend, bot.reasoningEffort ?? undefined),
  };
}

export async function assertBotModel(userId: string, bot: BotSettingsModel) {
  const row = bot.providerId ? await providersService.forRun(userId, bot.providerId) : undefined;

  if (!row) return;

  if (isModelApi(row.kind)) {
    await resolveModel(userId, {
      providerId: row.id,
      modelId: bot.modelId ?? undefined,
      reasoningEffort: bot.reasoningEffort ?? undefined,
    });

    return;
  }

  await requireSubscriptionToken(userId, providerBackend(row.kind));

  checkCatalog(row.kind, bot.modelId, bot.reasoningEffort);
}
