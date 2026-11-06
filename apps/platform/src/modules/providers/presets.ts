// Presets for the OpenAI-compatible kind (decision 0137): well-known servers whose name and address
// fill the form. They are not kinds of their own: what is saved is an `openai-compatible` provider,
// and the model is still picked from the server's own list.

export type CompatiblePreset = {
  id: string;
  /** The name the provider is given, which the person may change. */
  name: string;
  baseUrl: string;
  /** Whether the service refuses a call with no key; a server on the person's own machine does not. */
  needsKey: boolean;
  /** A model of the service, as the form's placeholder. */
  exampleModel: string;
  /** Where the person gets a key (shown for those that need one). */
  keyPlaceholder: string;
};

export const COMPATIBLE_PRESETS: readonly CompatiblePreset[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    needsKey: true,
    exampleModel: "anthropic/claude-sonnet-4.5",
    keyPlaceholder: "sk-or-…",
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    needsKey: true,
    exampleModel: "llama-3.3-70b-versatile",
    keyPlaceholder: "gsk_…",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    needsKey: true,
    exampleModel: "deepseek-chat",
    keyPlaceholder: "sk-…",
  },
  {
    id: "mistral",
    name: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    needsKey: true,
    exampleModel: "mistral-large-latest",
    keyPlaceholder: "Mistral API key",
  },
  {
    id: "xai",
    name: "xAI",
    baseUrl: "https://api.x.ai/v1",
    needsKey: true,
    exampleModel: "grok-4",
    keyPlaceholder: "xai-…",
  },
  {
    id: "ollama",
    name: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    needsKey: false,
    exampleModel: "llama3.1",
    keyPlaceholder: "Not needed",
  },
];
