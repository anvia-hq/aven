// The server behind an OpenAI-compatible provider is the person's own, so models.dev cannot say how
// big a model's window is or how it reasons. A LiteLLM gateway can: `/model/info` lists each model
// it serves with its `model_info`: `max_input_tokens`, and, for a model that takes a reasoning
// effort, `supports_reasoning_effort` and the `reasoning_effort_levels` it accepts. Asked with the
// provider's own key, at the provider's own address, as the model list is. A gateway that does not
// answer, or does not know the model, says nothing. The levels are never guessed: an effort the
// server does not list may be rejected by it.
const TIMEOUT_MS = 3_000;
const TTL_MS = 60 * 60 * 1000;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** What a gateway says about one model. */
export type GatewayModel = { contextWindow: number | null; effortLevels: string[] | null };

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

// Each model the gateway lists, by name, from one `/model/info` answer.
function modelsOf(body: unknown) {
  const models = new Map<string, GatewayModel>();
  const entries = isRecord(body) && Array.isArray(body.data) ? body.data : [];
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.model_name !== "string" || !isRecord(entry.model_info)) {
      continue;
    }
    models.set(entry.model_name, {
      // Only the input limit: LiteLLM's `max_tokens` is often what the model may write, not read.
      contextWindow: positive(entry.model_info.max_input_tokens),
      effortLevels: levelsOf(entry.model_info),
    });
  }
  return models;
}

export function createGatewayInfo(options: { fetch?: Fetch; now?: () => number } = {}) {
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  // The answer being waited for is kept too, so models asked for at once share one request.
  const known = new Map<
    string,
    { models: Promise<Map<string, GatewayModel> | null>; expires: number }
  >();

  // The models a gateway lists, or null when it does not answer with any.
  async function load(url: string, apiKey: string | undefined) {
    try {
      const response = await request(url, {
        headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const models = modelsOf(await response.json());
      return models.size > 0 ? models : null;
    } catch {
      return null;
    }
  }

  // One request serves every model of the gateway, so listing a provider's models asks it once.
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
    // An answer that is none is not kept: the next ask tries the gateway again.
    if (!models) {
      if (known.get(key) === entry) known.delete(key);
      return NOTHING;
    }
    return models.get(modelId) ?? NOTHING;
  };
}

export const gatewayModel = createGatewayInfo();
