import type { Provider } from "@aven/agents/model";
import { providerNeedsKey } from "@aven/protocol/providers";

import { UnavailableError, UnprocessableError } from "../../errors";
import { readKey } from "./crypto";
import { defaultModelId } from "./default-model";
import { gatewayModel } from "./gateway-info";
import { modelCatalog } from "./model-catalog";
import { effortsFor } from "./model-list";
import { providersService } from "./service";
import type { ModelSelection } from "./types";
import type { ModelConfig } from "@aven/agents/types";

export const ENV_KEYS: Partial<Record<Provider, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

export class ModelUnavailableError extends UnavailableError {}

export function environmentModel(): ModelConfig {
  const provider = (process.env.AGENT_PROVIDER ?? "anthropic") as Provider;
  if (provider !== "openai" && provider !== "anthropic" && provider !== "gemini") {
    throw new ModelUnavailableError(
      `AGENT_PROVIDER must be "openai", "anthropic" or "gemini", got "${provider}"`,
    );
  }
  return { provider, modelId: process.env.AGENT_MODEL || undefined };
}

export class InvalidSelectionError extends UnprocessableError {}

type ProviderKind = ModelConfig["provider"];

export async function resolveModel(
  userId: string,
  selection: ModelSelection = {},
): Promise<ModelConfig | null> {
  const row = await providersService.forRun(userId, selection.providerId);
  if (!row) return noProvider(selection);
  if (providerNeedsKey(row.kind) && !row.apiKeyEncrypted) {
    throw new InvalidSelectionError(
      `${row.name} has no API key yet; add it in Settings > Providers, or ask your bot for the key card`,
    );
  }
  const config: ModelConfig = {
    provider: row.kind,
    modelId: selection.modelId ?? row.modelId ?? undefined,
    baseUrl: row.baseUrl ?? undefined,
    apiKey: readKey(row),
  };
  if (selection.modelId) await assertRunnable(config.provider, selection.modelId);
  if (selection.reasoningEffort) await applyEffort(config, selection.reasoningEffort);
  config.contextWindow = (await contextWindowOf(config)) ?? undefined;
  return config;
}

export async function assertSeesImages(config: ModelConfig | null) {
  if (!config) return;
  const modelId = config.modelId ?? defaultModelId(config.provider);
  if (modelId && !(await modelCatalog.seesImages(config.provider, modelId))) {
    throw new InvalidSelectionError(`${modelId} does not take images; choose a model that does`);
  }
}

function noProvider(selection: ModelSelection) {
  if (selection.providerId) throw new InvalidSelectionError("Provider not found");
  if (selection.modelId || selection.reasoningEffort) {
    throw new InvalidSelectionError("Add a provider to choose a model");
  }
  return null;
}

async function assertRunnable(kind: ProviderKind, modelId: string) {
  if (!(await modelCatalog.canRun(kind, modelId))) {
    throw new InvalidSelectionError(`${modelId} cannot be used to run the agent`);
  }
}

async function contextWindowOf(config: ModelConfig) {
  const modelId = config.modelId ?? defaultModelId(config.provider);
  if (!modelId) return null;
  if (config.provider === "openai-compatible" && config.baseUrl)
    return (await gatewayModel(config.baseUrl, config.apiKey, modelId)).contextWindow;
  return modelCatalog.contextWindow(config.provider, modelId);
}

async function applyEffort(config: ModelConfig, reasoningEffort: string) {
  const { controls, effortLevels } = await effortsFor(
    { kind: config.provider, baseUrl: config.baseUrl, apiKey: config.apiKey },
    config.modelId,
  );
  if (!controls?.options.includes(reasoningEffort)) {
    throw new InvalidSelectionError(
      `This model does not support the "${reasoningEffort}" reasoning effort`,
    );
  }
  config.reasoningEffort = reasoningEffort;
  config.effortLevels = effortLevels;
}
