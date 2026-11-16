import type { AgentBackendKind, Provider as WireProvider } from "@aven/protocol/types";

export type ProviderKind = WireProvider;

export const PROVIDER_LABELS: Record<ProviderKind, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  bedrock: "Amazon Bedrock",
  vertex: "Google Vertex AI",
  azure: "Azure OpenAI",
  "openai-compatible": "OpenAI-compatible",
  "claude-subscription": "Claude subscription",
  "codex-subscription": "Codex subscription",
};

export const PROVIDER_DESCRIPTIONS: Record<ProviderKind, string> = {
  openai: "GPT models through the OpenAI API.",
  anthropic: "Claude models through the Anthropic API.",
  gemini: "Gemini models through the Google AI Studio API.",
  bedrock: "Models served by Amazon Bedrock, with a Bedrock API key.",
  vertex: "Gemini and other models in a Google Cloud project, through a service account.",
  azure: "Models you have deployed in an Azure OpenAI resource.",
  "openai-compatible": "Any server that speaks the OpenAI API, such as Ollama or vLLM.",
  "claude-subscription":
    "Claude Pro or Max, through the Claude Agent SDK, with a setup token from claude setup-token.",
  "codex-subscription":
    "GPT models on the Codex SDK, on your ChatGPT subscription, instead of Aven's own agent.",
};

export type Provider = {
  id: string;
  kind: ProviderKind;
  backend: AgentBackendKind;
  name: string;
  baseUrl: string | null;
  modelId: string | null;
  hasKey: boolean;
  keyHint: string | null;
  isDefault: boolean;
  createdAt: string;
};

export type ModelChoice = { provider: Provider; modelId: string; label: string };

export const isSubscription = (provider: { kind: ProviderKind }) =>
  provider.kind === "claude-subscription" || provider.kind === "codex-subscription";

export type ProviderPatch = {
  name?: string;
  apiKey?: string;
  baseUrl?: string;
  modelId?: string | null;
};

export type NewProvider = {
  kind: ProviderKind;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
};

type ModelEfforts = { options: string[]; defaultValue: string | null };

export type ProviderModels = {
  models: string[];
  efforts: Record<string, ModelEfforts>;
  labels?: Record<string, string>;
};

export type ListedModels = { models: string[]; labels?: Record<string, string> };

export type CompatiblePreset = {
  id: "openrouter" | "groq" | "deepseek" | "mistral" | "xai" | "ollama";
  name: string;
  description: string;
  baseUrl: string;
  needsKey: boolean;
  exampleModel: string;
  keyPlaceholder: string;
};

export type ModelsState = {
  status: "idle" | "loading" | "ready" | "error";
  models: string[] | null;
  labels?: Record<string, string>;
  error?: string;
};
