import type { Provider } from "@aven/protocol/types";

type Entry = {
  usable: boolean;
  deprecated: boolean;
  efforts: string[];
  contextWindow: number | null;
  images: boolean | null;
  label: string | null;
};

const CATALOG_KEYS: Partial<Record<Provider, string>> = {
  gemini: "google",
  bedrock: "amazon-bedrock",
  vertex: "google-vertex",
};

const catalogId = (kind: Provider, id: string) =>
  kind === "vertex" ? id.replace(/^google\//, "") : id;

const DEFAULT_URL = "https://models.dev/api.json";
const TTL_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
const MAX_WINDOWS = 16_384;
const MAX_MODELS = 4096;

type Snapshot = {
  entries: Partial<Record<Provider, Map<string, Entry>>>;
  windows: Map<string, number[]>;
};

type CatalogModel = {
  name?: string;
  tool_call?: boolean;
  modalities?: { input?: string[]; output?: string[] };
  status?: string;
  reasoning_options?: { type?: string; values?: string[] }[];
  limit?: { context?: number };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isUsable = (model: CatalogModel) =>
  model.tool_call === true && (model.modalities?.output ?? []).includes("text");

const effortsOf = (model: CatalogModel) =>
  (model.reasoning_options ?? []).flatMap((option) =>
    option.type === "effort" ? (option.values ?? []) : [],
  );

const contextWindowOf = (model: CatalogModel) => {
  const context = model.limit?.context;
  return typeof context === "number" && context > 0 ? context : null;
};

const imagesOf = (model: CatalogModel) => {
  const input = model.modalities?.input;
  return Array.isArray(input) ? input.includes("image") : null;
};

const OPENAI_CHAT = /^(gpt-|o\d|chatgpt-)/;
const OPENAI_OTHER =
  /embedding|whisper|tts|audio|image|realtime|transcribe|moderation|search|dall-e|davinci|babbage|instruct/;

const BEDROCK_OTHER = /embed|rerank|image|video|speech|canvas|reel|sonic|stable-/i;
const GEMINI_CHAT = /^gemini-/;
const GEMINI_OTHER = /embedding|tts|image|live|audio|aqa|robotics|computer-use/;

export function looksLikeChatModel(kind: Provider, id: string) {
  if (kind === "anthropic") return id.startsWith("claude-");

  if (kind === "bedrock") return !BEDROCK_OTHER.test(id);

  if (kind === "vertex") return true;

  if (kind === "gemini") return GEMINI_CHAT.test(id) && !GEMINI_OTHER.test(id);

  if (kind === "azure") return true;

  if (kind === "openai") return OPENAI_CHAT.test(id) && !OPENAI_OTHER.test(id);

  return true;
}

const configuredUrl = () => process.env.MODEL_CATALOG_URL ?? DEFAULT_URL;

function commonWindow(values: number[] | undefined) {
  if (!values) return null;

  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null;
}

const frequentFirst = (a: [string, number[]], b: [string, number[]]) =>
  b[1].length - a[1].length || (a[0] < b[0] ? -1 : Number(a[0] > b[0]));

function boundedWindows(byName: Map<string, number[]>) {
  return new Map([...byName].sort(frequentFirst).slice(0, MAX_WINDOWS));
}

export function createModelCatalog(
  fetchFn: typeof fetch = fetch,
  now: () => number = Date.now,
  catalogUrl: () => string = configuredUrl,
) {
  let entries: Partial<Record<Provider, Map<string, Entry>>> | null = null;
  let windows = new Map<string, number[]>();
  let nextTry = 0;
  let loading: Promise<void> | null = null;

  async function readCatalog(url: string): Promise<Snapshot> {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(8_000) });

    if (!res.ok) throw new Error(String(res.status));

    const json = (await res.json()) as Record<string, { models?: Record<string, unknown> }>;
    const next: Partial<Record<Provider, Map<string, Entry>>> = {};
    for (const kind of ["openai", "anthropic", "gemini", "bedrock", "vertex", "azure"] as const) {
      const models = json[CATALOG_KEYS[kind] ?? kind]?.models ?? {};
      next[kind] = new Map(
        Object.entries(models)
          .filter((entry): entry is [string, CatalogModel] => isRecord(entry[1]))
          .slice(0, MAX_MODELS)
          .map(([id, info]) => {
            return [
              id,
              {
                usable: isUsable(info),
                deprecated: info.status === "deprecated",
                efforts: effortsOf(info),
                contextWindow: contextWindowOf(info),
                images: imagesOf(info),
                label: typeof info.name === "string" && info.name.trim() ? info.name.trim() : null,
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
    return { entries: next, windows: boundedWindows(byName) };
  }

  async function refresh() {
    try {
      const url = catalogUrl();
      const snapshot = url ? await readCatalog(url) : null;

      if (!snapshot) {
        nextTry = now() + RETRY_MS;
        return;
      }

      entries = snapshot.entries;
      windows = snapshot.windows;
      nextTry = now() + TTL_MS;
    } catch {
      nextTry = now() + RETRY_MS;
    }
  }

  function startLoading() {
    if (loading) return loading;

    const shared = refresh().finally(() => {
      loading = null;
    });
    loading = shared;
    return shared;
  }

  async function lookup(kind: Provider) {
    if (now() >= nextTry) {
      const pending = startLoading();

      if (!entries) await pending;
    }

    return entries?.[kind] ?? null;
  }

  return {
    async chatModels(kind: Provider, ids: string[]) {
      if (kind === "openai-compatible") return ids;

      const known = await lookup(kind);
      return ids.filter((id) => {
        const entry = known?.get(catalogId(kind, id));
        return entry ? entry.usable && !entry.deprecated : looksLikeChatModel(kind, id);
      });
    },
    async knownChatModels(kind: Provider) {
      const known = await lookup(kind);
      const ids: string[] = [];
      for (const [id, entry] of known ?? []) {
        if (entry.usable && !entry.deprecated) ids.push(id);
      }
      return ids;
    },
    async efforts(kind: Provider, id: string) {
      if (kind === "openai-compatible" || kind === "bedrock" || kind === "vertex") return null;

      const levels = (await lookup(kind))?.get(id)?.efforts;
      return levels?.length ? levels : null;
    },
    async contextWindow(kind: Provider, id: string) {
      if (kind === "openai-compatible") return null;

      const own = (await lookup(kind))?.get(catalogId(kind, id))?.contextWindow ?? null;

      if (own !== null || kind !== "azure") return own;

      return commonWindow(windows.get(id.toLowerCase()));
    },
    async label(kind: Provider, id: string) {
      if (kind === "openai-compatible") return null;

      return (await lookup(kind))?.get(catalogId(kind, id))?.label ?? null;
    },
    async seesImages(kind: Provider, id: string) {
      if (kind === "openai-compatible") return true;

      return (await lookup(kind))?.get(catalogId(kind, id))?.images ?? true;
    },
    async canRun(kind: Provider, id: string) {
      if (kind === "openai-compatible") return true;

      const entry = (await lookup(kind))?.get(catalogId(kind, id));
      return entry ? entry.usable : looksLikeChatModel(kind, id);
    },
  };
}

export const modelCatalog = createModelCatalog();
