// The server behind an OpenAI-compatible provider is the person's own, so models.dev cannot say how
// big a model's window is. A LiteLLM gateway can: `/model/info` lists each model it serves with its
// `model_info.max_input_tokens`. Asked with the provider's own key, at the provider's own address,
// as the model list is. A gateway that does not answer, or does not know the model, is no window.
const TIMEOUT_MS = 3_000;
const TTL_MS = 60 * 60 * 1000;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const positive = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;

function windowOf(body: unknown, modelId: string) {
  const entries = isRecord(body) && Array.isArray(body.data) ? body.data : [];
  for (const entry of entries) {
    if (!isRecord(entry) || entry.model_name !== modelId || !isRecord(entry.model_info)) continue;
    // Only the input limit: LiteLLM's `max_tokens` is often what the model may write, not read.
    const window = positive(entry.model_info.max_input_tokens);
    if (window) return window;
  }
  return null;
}

export function createGatewayContext(options: { fetch?: Fetch; now?: () => number } = {}) {
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const known = new Map<string, { window: number; expires: number }>();

  // The model's context window in tokens, or null when the gateway does not say.
  return async function contextWindow(
    baseUrl: string,
    apiKey: string | undefined,
    modelId: string,
  ) {
    const url = `${baseUrl.replace(/\/+$/, "")}/model/info`;
    const key = `${url}\n${modelId}`;
    const cached = known.get(key);
    if (cached && cached.expires > now()) return cached.window;
    try {
      const response = await request(url, {
        headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const window = windowOf(await response.json(), modelId);
      if (window) known.set(key, { window, expires: now() + TTL_MS });
      return window;
    } catch {
      return null;
    }
  };
}

export const gatewayContextWindow = createGatewayContext();
