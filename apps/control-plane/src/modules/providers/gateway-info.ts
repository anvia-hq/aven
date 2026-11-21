import { assertPublicProviderUrl } from "@aven/server-kit/address-guard";
import { hashOpaqueToken } from "@aven/server-kit/tokens";
import type { GatewayModel } from "./types";

const TIMEOUT_MS = 3_000;
const TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 256;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const positive = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;

const text = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

function levelsOf(value: unknown) {
  const names = Array.isArray(value)
    ? value.filter((level): level is string => typeof level === "string" && level !== "")
    : [];

  return names.length > 0 ? [...new Set(names)] : null;
}

function infoModel(info: Record<string, unknown>): GatewayModel {
  return {
    contextWindow: positive(info.max_input_tokens),
    effortLevels:
      info.supports_reasoning_effort === true ? levelsOf(info.reasoning_effort_levels) : null,
    effortKnown: true,
    defaultEffort: null,
    label: null,
  };
}

function listingModel(entry: Record<string, unknown>): GatewayModel {
  const effort = isRecord(entry.effort) ? entry.effort : null;
  const effortLevels = effort ? levelsOf(effort.supported_levels) : null;
  const chosen = text(effort?.default_level);

  return {
    contextWindow: positive(entry.context_window),
    effortLevels,
    effortKnown: effort !== null,
    defaultEffort: chosen && effortLevels?.includes(chosen) ? chosen : null,
    label: text(entry.name),
  };
}

function modelsIn(
  body: unknown,
  read: (entry: Record<string, unknown>) => [string, GatewayModel] | null,
) {
  const models = new Map<string, GatewayModel>();
  const entries = isRecord(body) && Array.isArray(body.data) ? body.data : [];
  for (const entry of entries) {
    if (!isRecord(entry)) continue;

    const found = read(entry);

    if (found) models.set(found[0], found[1]);
  }
  return models.size > 0 ? models : null;
}

const infoModels = (body: unknown) =>
  modelsIn(body, (entry) =>
    typeof entry.model_name === "string" && isRecord(entry.model_info)
      ? [entry.model_name, infoModel(entry.model_info)]
      : null,
  );

const listingModels = (body: unknown) =>
  modelsIn(body, (entry) =>
    typeof entry.id === "string" ? [entry.id, listingModel(entry)] : null,
  );

export function createGatewayInfo(options: { fetch?: Fetch; now?: () => number } = {}) {
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const known = new Map<
    string,
    { models: Promise<Map<string, GatewayModel> | null>; expires: number }
  >();

  async function read(url: string, apiKey: string | undefined) {
    try {
      await assertPublicProviderUrl(url);
      const response = await request(url, {
        headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "error",
      });

      if (!response.ok) return null;

      return await response.json().catch(() => null);
    } catch {
      return null;
    }
  }

  async function load(base: string, apiKey: string | undefined) {
    const info = infoModels(await read(`${base}/model/info`, apiKey));

    if (info) return info;

    return listingModels(await read(`${base}/models`, apiKey));
  }

  return async function gatewayModel(
    baseUrl: string,
    apiKey: string | undefined,
    modelId: string,
  ): Promise<GatewayModel | null> {
    const base = baseUrl.replace(/\/+$/, "");
    const key = `${base}\n${apiKey ? hashOpaqueToken(apiKey) : ""}`;
    let entry = known.get(key);

    if (!entry || entry.expires <= now()) {
      if (known.size >= MAX_CACHE_ENTRIES) {
        const oldest = known.keys().next().value;

        if (oldest !== undefined) known.delete(oldest);
      }

      entry = { models: load(base, apiKey), expires: now() + TTL_MS };
      known.set(key, entry);
    }

    const models = await entry.models;

    if (!models) {
      if (known.get(key) === entry) known.delete(key);

      return null;
    }

    return models.get(modelId) ?? null;
  };
}

export const gatewayModel = createGatewayInfo();
