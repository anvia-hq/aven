import { reasoningControlsFor, type ReasoningControls } from "@aven/agents/model";

import { UnprocessableError } from "../../errors";
import { gatewayModel } from "./gateway-info";
import { modelCatalog } from "./model-catalog";
import { azureEndpoint, bedrockEndpoint } from "./schema";
import type { ModelSource } from "./types";

export class ModelListError extends UnprocessableError {}

function requireApiKey({ apiKey }: ModelSource) {
  if (!apiKey) throw new ModelListError("An API key is needed to list models");
  return apiKey;
}

function modelsRequest(source: ModelSource) {
  if (source.kind === "azure") {
    if (!source.baseUrl) throw new ModelListError("A resource URL is needed to list models");
    const origin = azureEndpoint.safeParse(source.baseUrl);
    if (!origin.success) throw new ModelListError("An Azure resource URL must be https");
    return {
      url: `${origin.data}/openai/deployments?api-version=2022-12-01`,
      headers: { "api-key": requireApiKey(source) },
    };
  }
  if (source.kind === "vertex") {
    throw new ModelListError(
      "Vertex AI has no model list: type the model id, such as google/gemini-2.5-flash",
    );
  }
  if (source.kind === "bedrock") {
    if (!source.baseUrl) throw new ModelListError("A region is needed to list models");
    const endpoint = bedrockEndpoint.safeParse(source.baseUrl);
    if (!endpoint.success) throw new ModelListError("Not a Bedrock endpoint");
    return {
      url: `${endpoint.data}/models`,
      headers: { authorization: `Bearer ${requireApiKey(source)}` },
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
  const ids = data.flatMap((item: { id?: unknown; status?: unknown }) =>
    typeof item?.id === "string" && (item.status === undefined || item.status === "succeeded")
      ? [item.id]
      : [],
  );
  return [...new Set(ids)].sort();
}

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

export async function listAgentModels(source: ModelSource, fetchFn?: typeof fetch) {
  if (source.kind === "vertex") {
    const known = await modelCatalog.knownChatModels("vertex");
    const ids = known.filter((id) => id.startsWith("gemini-")).map((id) => `google/${id}`);
    if (ids.length === 0) throw new ModelListError("Could not load the Vertex AI model list");
    return ids.sort();
  }
  const ids = await fetchModels(source, fetchFn);
  return modelCatalog.chatModels(source.kind, ids);
}

async function listedEfforts(source: ModelSource, modelId: string) {
  if (source.kind === "bedrock" || source.kind === "vertex") return null;
  if (source.kind === "openai-compatible") {
    if (!source.baseUrl) return null;
    return (await gatewayModel(source.baseUrl, source.apiKey, modelId)).effortLevels;
  }
  return modelCatalog.efforts(source.kind, modelId);
}

export async function effortsFor(source: ModelSource, modelId: string | undefined) {
  const sdk = reasoningControlsFor({ provider: source.kind, modelId });
  if (sdk || !modelId) return { controls: sdk, effortLevels: undefined };
  const effortLevels = (await listedEfforts(source, modelId)) ?? undefined;
  return {
    controls: reasoningControlsFor({ provider: source.kind, modelId, effortLevels }),
    effortLevels,
  };
}

export async function effortsByModel(source: ModelSource, ids: string[]) {
  const entries = await Promise.all(
    ids.map(async (id) => [id, (await effortsFor(source, id)).controls] as const),
  );
  return Object.fromEntries(
    entries.filter((entry): entry is readonly [string, ReasoningControls] => entry[1] !== null),
  );
}
