import type { Provider as WireProvider } from "@aven/protocol/runtime-wire";

export type ProviderKind = WireProvider;

export const PROVIDER_LABELS: Record<ProviderKind, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  azure: "Azure OpenAI",
  "openai-compatible": "OpenAI-compatible",
};

// Providers belong to the signed-in user. The API never returns the key, only its last characters.
export const PROVIDER_DESCRIPTIONS: Record<ProviderKind, string> = {
  openai: "GPT models through the OpenAI API.",
  anthropic: "Claude models through the Anthropic API.",
  azure: "Models you have deployed in an Azure OpenAI resource.",
  "openai-compatible": "Any server that speaks the OpenAI API, such as Ollama or vLLM.",
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

/** A model a person can pick, and the provider it comes from. */
export type ModelChoice = { provider: Provider; modelId: string };

/** What an edit may change; an omitted key is kept, and a null model falls back to the default. */
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

/** The reasoning levels a model accepts, lowest first, and the one it uses when none is sent. */
type ModelEfforts = { options: string[]; defaultValue: string | null };

/** What a provider offers: its model ids, and the effort levels of those that have any. */
export type ProviderModels = { models: string[]; efforts: Record<string, ModelEfforts> };
