import type { ModelConfig, Provider } from "@aven/agents/model";

import { providerNeedsKey } from "@aven/protocol/providers";

import { UnavailableError, UnprocessableError } from "../../errors";
import { readKey } from "./crypto";
import { defaultModelId } from "./default-model";
import { gatewayModel } from "./gateway-info";
import { modelCatalog } from "./model-catalog";
import { effortsFor } from "./model-list";
import { providersService } from "./service";

// Azure and compatible servers have no shared environment key: the user's own is required or optional.
export const ENV_KEYS: Partial<Record<Provider, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};

/** The model a run asked for cannot be used, such as a missing environment key. */
export class ModelUnavailableError extends UnavailableError {}

// With no provider of their own, a sender runs on the environment's shared one.
export function environmentModel(): ModelConfig {
  const provider = (process.env.AGENT_PROVIDER ?? "anthropic") as Provider;
  if (provider !== "openai" && provider !== "anthropic") {
    throw new ModelUnavailableError(
      `AGENT_PROVIDER must be "openai" or "anthropic", got "${provider}"`,
    );
  }
  return { provider, modelId: process.env.AGENT_MODEL || undefined };
}

// A message asked for a provider, model or effort the user cannot run with.
export class InvalidSelectionError extends UnprocessableError {}

type ProviderKind = ModelConfig["provider"];

// What a message may choose beyond the user's default: one of their own providers, a model of it
// and a reasoning effort that model supports.
export type ModelSelection = { providerId?: string; modelId?: string; reasoningEffort?: string };

// The model configuration for a run: the provider the message chose (it must be the user's own)
// or else their default, or null if they have neither. Decrypts the key, so call it only where
// a run is being started. Throws InvalidSelectionError for a choice that cannot run.
export async function resolveModel(
  userId: string,
  selection: ModelSelection = {},
): Promise<ModelConfig | null> {
  const row = await providersService.forRun(userId, selection.providerId);
  if (!row) return noProvider(selection);
  // A provider a bot made waits for its key, which the person types into a card (decision 0086).
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

// A message with images needs a model that takes them (decision 0034). Refused only when the
// catalog says it does not; the environment's model (null) is the operator's choice.
export async function assertSeesImages(config: ModelConfig | null) {
  if (!config) return;
  const modelId = config.modelId ?? defaultModelId(config.provider);
  if (modelId && !(await modelCatalog.seesImages(config.provider, modelId))) {
    throw new InvalidSelectionError(`${modelId} does not take images; choose a model that does`);
  }
}

// With no provider found, a message that chose nothing runs on the environment's.
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

// The window of the model the run will use, the provider's default when none is named.
async function contextWindowOf(config: ModelConfig) {
  const modelId = config.modelId ?? defaultModelId(config.provider);
  if (!modelId) return null;
  // The catalog knows no model of a server the person runs; the server itself may (LiteLLM does).
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
