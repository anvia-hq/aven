// Which of a provider's models can drive the agent. `GET /models` lists everything the key can
// reach (embeddings, speech, image models), so openai and anthropic lists are filtered through the
// models.dev catalog (https://models.dev/api.json). Ids it does not know, or any id while it is
// unreachable, fall back to a name check.

type Kind = "openai" | "anthropic" | "azure" | "openai-compatible";
type Entry = {
  usable: boolean;
  deprecated: boolean;
  efforts: string[];
  contextWindow: number | null;
};

const DEFAULT_URL = "https://models.dev/api.json";
const TTL_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;

// The agent needs tool calls and a text answer.
type CatalogModel = {
  tool_call?: boolean;
  modalities?: { output?: string[] };
  status?: string;
  reasoning_options?: { type?: string; values?: string[] }[];
  limit?: { context?: number };
};

// Entries come from a third-party document; one that is not an object is skipped, not trusted.
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isUsable = (model: CatalogModel) =>
  model.tool_call === true && (model.modalities?.output ?? []).includes("text");

// The effort levels the catalog lists, lowest first as it gives them.
const effortsOf = (model: CatalogModel) =>
  (model.reasoning_options ?? []).flatMap((option) =>
    option.type === "effort" ? (option.values ?? []) : [],
  );

// The model's context window in tokens, when the catalog gives a usable number.
const contextWindowOf = (model: CatalogModel) => {
  const context = model.limit?.context;
  return typeof context === "number" && context > 0 ? context : null;
};

// Name check for ids models.dev has not listed yet. Anthropic only has chat models; OpenAI mixes
// them with other modalities, so the other families are named out.
const OPENAI_CHAT = /^(gpt-|o\d|chatgpt-)/;
const OPENAI_OTHER =
  /embedding|whisper|tts|audio|image|realtime|transcribe|moderation|search|dall-e|davinci|babbage|instruct/;

export function looksLikeChatModel(kind: Kind, id: string) {
  if (kind === "anthropic") return id.startsWith("claude-");
  if (kind === "azure") return true; // a deployment's name is the owner's, not the model's
  if (kind === "openai") return OPENAI_CHAT.test(id) && !OPENAI_OTHER.test(id);
  return true;
}

// An empty MODEL_CATALOG_URL turns the catalog off (air-gapped installs, tests).
const configuredUrl = () => process.env.MODEL_CATALOG_URL ?? DEFAULT_URL;

// The window most hosts give a model; hosts that cap it lower are the exception.
function commonWindow(values: number[] | undefined) {
  if (!values) return null;
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null;
}

export function createModelCatalog(
  fetchFn: typeof fetch = fetch,
  now: () => number = Date.now,
  catalogUrl: () => string = configuredUrl,
) {
  let entries: Partial<Record<Kind, Map<string, Entry>>> | null = null;
  // Context windows of every provider's models by lowercase name: a model has the window it has on
  // whatever host serves it, which matters where the host's own entry is thin (Azure).
  let windows = new Map<string, number[]>();
  let nextTry = 0;
  let loading: Promise<void> | null = null;

  async function refresh() {
    const url = catalogUrl();
    if (!url) {
      nextTry = now() + RETRY_MS;
      return;
    }
    try {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as Record<string, { models?: Record<string, unknown> }>;
      const next: Partial<Record<Kind, Map<string, Entry>>> = {};
      for (const kind of ["openai", "anthropic", "azure"] as const) {
        const models = json[kind]?.models ?? {};
        next[kind] = new Map(
          Object.entries(models)
            .filter((entry): entry is [string, CatalogModel] => isRecord(entry[1]))
            .map(([id, info]) => {
              return [
                id,
                {
                  usable: isUsable(info),
                  deprecated: info.status === "deprecated",
                  efforts: effortsOf(info),
                  contextWindow: contextWindowOf(info),
                },
              ];
            }),
        );
      }
      const byName = new Map<string, number[]>();
      for (const provider of Object.values(json)) {
        for (const [id, info] of Object.entries(provider?.models ?? {})) {
          const window = isRecord(info) ? contextWindowOf(info) : null;
          if (window === null) continue;
          const name = id.toLowerCase().split("/").pop() ?? id;
          const seen = byName.get(name) ?? [];
          seen.push(window);
          byName.set(name, seen);
        }
      }
      windows = byName;
      entries = next;
      nextTry = now() + TTL_MS;
    } catch {
      // Keep serving the last catalog if there is one, and try again soon.
      nextTry = now() + RETRY_MS;
    }
  }

  async function lookup(kind: Kind) {
    if (now() >= nextTry) loading ??= refresh().finally(() => (loading = null));
    // The first load is waited for; later refreshes happen behind a stale catalog.
    if (!entries) await loading;
    return entries?.[kind] ?? null;
  }

  return {
    // `ids` that can drive the agent, current ones only.
    async chatModels(kind: Kind, ids: string[]) {
      if (kind === "openai-compatible") return ids;
      const known = await lookup(kind);
      return ids.filter((id) => {
        const entry = known?.get(id);
        return entry ? entry.usable && !entry.deprecated : looksLikeChatModel(kind, id);
      });
    },
    // The reasoning levels the catalog lists for a model, or null. Only a fallback for models the
    // SDK does not know: the SDK's own list wins, because it rejects anything else.
    async efforts(kind: Kind, id: string) {
      if (kind === "openai-compatible") return null;
      const levels = (await lookup(kind))?.get(id)?.efforts;
      return levels?.length ? levels : null;
    },
    // The model's context window in tokens, or null when the catalog does not know it. Without
    // one the agent cannot report how full the context is.
    async contextWindow(kind: Kind, id: string) {
      if (kind === "openai-compatible") return null;
      const own = (await lookup(kind))?.get(id)?.contextWindow ?? null;
      if (own !== null || kind !== "azure") return own;
      return commonWindow(windows.get(id.toLowerCase()));
    },
    // Whether a model a message names can run: refused only when the catalog says it cannot.
    async canRun(kind: Kind, id: string) {
      if (kind === "openai-compatible") return true;
      const entry = (await lookup(kind))?.get(id);
      return entry ? entry.usable : looksLikeChatModel(kind, id);
    },
  };
}

export const modelCatalog = createModelCatalog();
