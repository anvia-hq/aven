// Which of a provider's models can drive the agent. `GET /models` lists everything the key can
// reach (embeddings, speech, image models), so openai and anthropic lists are filtered through the
// models.dev catalog (https://models.dev/api.json). Ids it does not know, or any id while it is
// unreachable, fall back to a name check.

type Kind = "openai" | "anthropic" | "openai-compatible";
type Entry = { usable: boolean; deprecated: boolean; efforts: string[] };

const DEFAULT_URL = "https://models.dev/api.json";
const TTL_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;

// The agent needs tool calls and a text answer.
type CatalogModel = {
  tool_call?: boolean;
  modalities?: { output?: string[] };
  status?: string;
  reasoning_options?: { type?: string; values?: string[] }[];
};

const isUsable = (model: CatalogModel) =>
  model.tool_call === true && (model.modalities?.output ?? []).includes("text");

// The effort levels the catalog lists, lowest first as it gives them.
const effortsOf = (model: CatalogModel) =>
  (model.reasoning_options ?? []).flatMap((option) =>
    option.type === "effort" ? (option.values ?? []) : [],
  );

// Name check for ids models.dev has not listed yet. Anthropic only has chat models; OpenAI mixes
// them with other modalities, so the other families are named out.
const OPENAI_CHAT = /^(gpt-|o\d|chatgpt-)/;
const OPENAI_OTHER =
  /embedding|whisper|tts|audio|image|realtime|transcribe|moderation|search|dall-e|davinci|babbage|instruct/;

export function looksLikeChatModel(kind: Kind, id: string) {
  if (kind === "anthropic") return id.startsWith("claude-");
  if (kind === "openai") return OPENAI_CHAT.test(id) && !OPENAI_OTHER.test(id);
  return true;
}

// An empty MODEL_CATALOG_URL turns the catalog off (air-gapped installs, tests).
const configuredUrl = () => process.env.MODEL_CATALOG_URL ?? DEFAULT_URL;

export function createModelCatalog(
  fetchFn: typeof fetch = fetch,
  now: () => number = Date.now,
  catalogUrl: () => string = configuredUrl,
) {
  let entries: Partial<Record<Kind, Map<string, Entry>>> | null = null;
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
      for (const kind of ["openai", "anthropic"] as const) {
        const models = json[kind]?.models ?? {};
        next[kind] = new Map(
          Object.entries(models).map(([id, model]) => {
            const info = model as CatalogModel;
            return [
              id,
              {
                usable: isUsable(info),
                deprecated: info.status === "deprecated",
                efforts: effortsOf(info),
              },
            ];
          }),
        );
      }
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
    // Whether a model a message names can run: refused only when the catalog says it cannot.
    async canRun(kind: Kind, id: string) {
      if (kind === "openai-compatible") return true;
      const entry = (await lookup(kind))?.get(id);
      return entry ? entry.usable : looksLikeChatModel(kind, id);
    },
  };
}

export const modelCatalog = createModelCatalog();
