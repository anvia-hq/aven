import type { Provider as WireProvider } from "@aven/protocol/types";

export type ProviderKind = WireProvider;

export const PROVIDER_LABELS: Record<ProviderKind, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  bedrock: "Amazon Bedrock",
  vertex: "Google Vertex AI",
  azure: "Azure OpenAI",
  "openai-compatible": "OpenAI-compatible",
  codex: "Codex",
};

export const PROVIDER_DESCRIPTIONS: Record<ProviderKind, string> = {
  openai: "GPT models through the OpenAI API.",
  anthropic: "Claude models through the Anthropic API.",
  gemini: "Gemini models through the Google AI Studio API.",
  bedrock: "Models served by Amazon Bedrock, with a Bedrock API key.",
  vertex: "Gemini and other models in a Google Cloud project, through a service account.",
  azure: "Models you have deployed in an Azure OpenAI resource.",
  "openai-compatible": "Any server that speaks the OpenAI API, such as Ollama or vLLM.",
  codex: "Your ChatGPT plan, through the Codex login on your own runner.",
};

export type Provider = {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl: string | null;
  modelId: string | null;
  hasKey: boolean;
  keyHint: string | null;
  isDefault: boolean;
  createdAt: string;
};

export type ModelChoice = { provider: Provider; modelId: string; label: string };

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
