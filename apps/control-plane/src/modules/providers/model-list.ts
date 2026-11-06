import { reasoningControlsFor, type ModelConfig, type ReasoningControls } from "@aven/agents/model";

import { UnprocessableError } from "../../errors";
import { gatewayModel } from "./gateway-info";
import { modelCatalog } from "./model-catalog";
import { azureEndpoint } from "./schema";

export class ModelListError extends UnprocessableError {}

type ProviderKind = ModelConfig["provider"];

export type ModelSource = { kind: ProviderKind; apiKey?: string; baseUrl?: string };

function requireApiKey({ apiKey }: ModelSource) {
  if (!apiKey) throw new ModelListError("An API key is needed to list models");
  return apiKey;
}

// Where a provider's model list is and how to ask for it.
function modelsRequest(source: ModelSource) {
  if (source.kind === "azure") {
    // The resource's own deployments (decision 0025); its v1 `/models` lists what could be deployed.
    if (!source.baseUrl) throw new ModelListError("A resource URL is needed to list models");
    const origin = azureEndpoint.safeParse(source.baseUrl);
    if (!origin.success) throw new ModelListError("An Azure resource URL must be https");
    return {
      url: `${origin.data}/openai/deployments?api-version=2022-12-01`,
      headers: { "api-key": requireApiKey(source) },
    };
  }
  if (source.kind === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/models?limit=1000",
      headers: { "x-api-key": requireApiKey(source), "anthropic-version": "2023-06-01" },
    };
  }
  if (source.kind === "gemini") {
    return {
      url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
      headers: { "x-goog-api-key": requireApiKey(source) },
    };
  }
  const headers: Record<string, string> = {};
  if (source.apiKey) headers.authorization = `Bearer ${source.apiKey}`;
  if (source.kind === "openai") {
    requireApiKey(source);
    return { url: "https://api.openai.com/v1/models", headers };
  }
  if (!source.baseUrl) throw new ModelListError("A base URL is needed to list models");
  return { url: `${source.baseUrl.replace(/\/+$/, "")}/models`, headers };
}

// Google lists `{ models: [{ name: "models/gemini-2.5-pro", supportedGenerationMethods }] }`: the
// ones that can generate content, by the name after `models/`.
function parseGeminiModelIds(models: unknown) {
  if (!Array.isArray(models)) throw new ModelListError("The provider returned no model list");
  const ids = models.flatMap((item: { name?: unknown; supportedGenerationMethods?: unknown }) => {
    const methods = item?.supportedGenerationMethods;
    const canGenerate = Array.isArray(methods) && methods.includes("generateContent");
    return typeof item?.name === "string" && canGenerate
      ? [item.name.replace(/^models\//, "")]
      : [];
  });
  return [...new Set(ids)].sort();
}

function parseModelIds(json: unknown) {
  const models = (json as { models?: unknown } | null)?.models;
  if (models !== undefined) return parseGeminiModelIds(models);
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) throw new ModelListError("The provider returned no model list");
  // A deployment that has not finished (or failed) provisioning cannot be called yet.
  const ids = data.flatMap((item: { id?: unknown; status?: unknown }) =>
    typeof item?.id === "string" && (item.status === undefined || item.status === "succeeded")
      ? [item.id]
      : [],
  );
  return [...new Set(ids)].sort();
}

// Asks the provider itself which models the key can use (`GET <base>/models`). `fetchFn` is
// injectable so tests never hit the network.
export async function fetchModels(source: ModelSource, fetchFn: typeof fetch = fetch) {
  const { url, headers } = modelsRequest(source);
  let res: Response;
  try {
    res = await fetchFn(url, { headers, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new ModelListError("Could not reach the provider");
  }
  if (!res.ok) throw new ModelListError(`The provider answered ${res.status} listing models`);
  return parseModelIds(await res.json().catch(() => null));
}

// A provider's models that can drive the agent (see `model-catalog.ts`).
export async function listAgentModels(source: ModelSource, fetchFn?: typeof fetch) {
  const ids = await fetchModels(source, fetchFn);
  return modelCatalog.chatModels(source.kind, ids);
}

// The levels a model of a server the person runs says it accepts: a gateway lists them itself,
// models.dev knows nothing of such a server.
async function listedEfforts(source: ModelSource, modelId: string) {
  if (source.kind === "openai-compatible") {
    if (!source.baseUrl) return null;
    return (await gatewayModel(source.baseUrl, source.apiKey, modelId)).effortLevels;
  }
  return modelCatalog.efforts(source.kind, modelId);
}

// A model's effort levels: the SDK's own list, or for a model newer than the SDK, or served by a
// gateway, the ones models.dev or the gateway lists (`effortLevels`, which the model must then be
// built with for the SDK to accept it).
export async function effortsFor(source: ModelSource, modelId: string | undefined) {
  const sdk = reasoningControlsFor({ provider: source.kind, modelId });
  if (sdk || !modelId) return { controls: sdk, effortLevels: undefined };
  const effortLevels = (await listedEfforts(source, modelId)) ?? undefined;
  return {
    controls: reasoningControlsFor({ provider: source.kind, modelId, effortLevels }),
    effortLevels,
  };
}

// The effort levels of each listed model that has any; models without the control are left out.
export async function effortsByModel(source: ModelSource, ids: string[]) {
  const entries = await Promise.all(
    ids.map(async (id) => [id, (await effortsFor(source, id)).controls] as const),
  );
  return Object.fromEntries(
    entries.filter((entry): entry is readonly [string, ReasoningControls] => entry[1] !== null),
  );
}
