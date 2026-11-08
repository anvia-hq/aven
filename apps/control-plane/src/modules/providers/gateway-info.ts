import { assertPublicProviderUrl } from "./address-guard";
import type { GatewayModel } from "./types";

const TIMEOUT_MS = 3_000;
const TTL_MS = 60 * 60 * 1000;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const NOTHING: GatewayModel = { contextWindow: null, effortLevels: null };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const positive = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;

function levelsOf(info: Record<string, unknown>) {
  const levels = info.reasoning_effort_levels;
  if (info.supports_reasoning_effort !== true || !Array.isArray(levels)) return null;
  const names = levels.filter(
    (level): level is string => typeof level === "string" && level !== "",
  );
  return names.length > 0 ? [...new Set(names)] : null;
}

function modelsOf(body: unknown) {
  const models = new Map<string, GatewayModel>();
  const entries = isRecord(body) && Array.isArray(body.data) ? body.data : [];
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.model_name !== "string" || !isRecord(entry.model_info)) {
      continue;
    }
    models.set(entry.model_name, {
      contextWindow: positive(entry.model_info.max_input_tokens),
      effortLevels: levelsOf(entry.model_info),
    });
  }
  return models;
}

export function createGatewayInfo(options: { fetch?: Fetch; now?: () => number } = {}) {
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const known = new Map<
    string,
    { models: Promise<Map<string, GatewayModel> | null>; expires: number }
  >();

  async function load(url: string, apiKey: string | undefined) {
    try {
      await assertPublicProviderUrl(url);
      const response = await request(url, {
        headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "error",
      });
      if (!response.ok) return null;
      const models = modelsOf(await response.json());
      return models.size > 0 ? models : null;
    } catch {
      return null;
    }
  }

  return async function gatewayModel(
    baseUrl: string,
    apiKey: string | undefined,
    modelId: string,
  ): Promise<GatewayModel> {
    const url = `${baseUrl.replace(/\/+$/, "")}/model/info`;
    const key = `${url}\n${apiKey ?? ""}`;
    let entry = known.get(key);
    if (!entry || entry.expires <= now()) {
      entry = { models: load(url, apiKey), expires: now() + TTL_MS };
      known.set(key, entry);
    }
    const models = await entry.models;
    if (!models) {
      if (known.get(key) === entry) known.delete(key);
      return NOTHING;
    }
    return models.get(modelId) ?? NOTHING;
  };
}

export const gatewayModel = createGatewayInfo();
