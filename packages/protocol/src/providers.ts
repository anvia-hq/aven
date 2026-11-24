import { MODEL_APIS } from "./runtime-wire";
import type {
  AgentBackendKind,
  CompatibleVendor,
  CompatibleVendorId,
  ModelApi,
  Provider,
  ProviderKeyAsk,
  QuestionPrompt,
} from "./types";

export const isModelApi = (kind: string): kind is ModelApi =>
  (MODEL_APIS as readonly string[]).includes(kind);

export const providerNeedsKey = (kind: Provider) => kind !== "openai-compatible";

export const COMPATIBLE_VENDORS: Readonly<Record<CompatibleVendorId, CompatibleVendor>> = {
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", catalog: "openrouter" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", catalog: "groq" },
  deepseek: { baseUrl: "https://api.deepseek.com", catalog: "deepseek" },
  mistral: { baseUrl: "https://api.mistral.ai/v1", catalog: "mistral" },
  xai: { baseUrl: "https://api.x.ai/v1", catalog: "xai" },
  alibaba: {
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    catalog: "alibaba",
  },
  "opencode-go": { baseUrl: "https://opencode.ai/inference/go/openai/v1", catalog: "opencode-go" },
  moonshot: { baseUrl: "https://api.moonshot.ai/v1", catalog: "moonshotai" },
  zai: { baseUrl: "https://api.z.ai/api/paas/v4", catalog: "zai" },
  ollama: { baseUrl: "http://localhost:11434/v1", catalog: null },
};

const hostOf = (value: string | null | undefined) => {
  if (!value) return null;

  try {
    return new URL(value).host;
  } catch {
    return null;
  }
};

const VENDOR_HOSTS = (Object.keys(COMPATIBLE_VENDORS) as CompatibleVendorId[]).map((id) => ({
  id,
  host: hostOf(COMPATIBLE_VENDORS[id].baseUrl),
}));

export function catalogVendorOf(baseUrl: string | null | undefined): string | null {
  const host = hostOf(baseUrl);

  if (!host) return null;

  const vendor = VENDOR_HOSTS.find((candidate) => candidate.host === host);

  return vendor ? COMPATIBLE_VENDORS[vendor.id].catalog : null;
}

export const SUBSCRIPTION_PROVIDERS = ["claude-subscription", "codex-subscription"] as const;

export const isSubscriptionProvider = (
  kind: Provider,
): kind is "claude-subscription" | "codex-subscription" =>
  kind === "claude-subscription" || kind === "codex-subscription";

export const providerBackend = (kind: Provider): AgentBackendKind => {
  if (kind === "claude-subscription") return "claude";

  if (kind === "codex-subscription") return "codex";

  return "native";
};

export const bedrockBaseUrl = (region: string) => `https://bedrock-mantle.${region}.api.aws/v1`;

export const BEDROCK_ENDPOINT =
  /^https:\/\/bedrock-mantle\.([a-z]{2}(?:-[a-z]+)+-\d+)\.api\.aws\/v1\/?$/;

export const bedrockRegionOf = (baseUrl: string | null | undefined) =>
  (baseUrl && BEDROCK_ENDPOINT.exec(baseUrl)?.[1]) || null;

export const vertexBaseUrl = (project: string, location: string) => {
  const host = location === "global" ? "aiplatform" : `${location}-aiplatform`;
  return `https://${host}.googleapis.com/v1/projects/${project}/locations/${location}/endpoints/openapi`;
};

const VERTEX_ENDPOINT =
  /^https:\/\/(?:aiplatform|([a-z]+(?:-[a-z0-9]+)+)-aiplatform)\.googleapis\.com\/v1\/projects\/([a-z][a-z0-9-]{4,28}[a-z0-9])\/locations\/(global|[a-z]+(?:-[a-z0-9]+)+)\/endpoints\/openapi\/?$/;

export function vertexPartsOf(baseUrl: string | null | undefined) {
  const match = baseUrl ? VERTEX_ENDPOINT.exec(baseUrl) : null;

  if (!match) return null;

  const hostRegion: string | undefined = match[1];
  const project = match[2] as string;
  const location = match[3] as string;

  if ((hostRegion ?? "global") !== location) return null;

  return { project, location };
}

export const providerKeyQuestion = (
  providerKey: ProviderKeyAsk,
): QuestionPrompt & { providerKey: ProviderKeyAsk } => ({
  id: "key",
  text: `Enter the API key for ${providerKey.name}`,
  providerKey,
});
