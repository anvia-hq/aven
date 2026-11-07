// Services with a panel of their own in Settings > Providers (decision 0141). They are not kinds of
// the server: what is saved is an `openai-compatible` provider at the service's address, and the
// model is still picked from the server's own list. A saved provider belongs to a panel when its
// address is the preset's.

export type CompatiblePreset = {
  id: "openrouter" | "groq" | "deepseek" | "mistral" | "xai" | "ollama";
  /** The panel's title, and the name the provider is saved with. */
  name: string;
  /** One line under the title, like the other kinds'. */
  description: string;
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
    description: "Many vendors' models through one OpenRouter key.",
    baseUrl: "https://openrouter.ai/api/v1",
    needsKey: true,
    exampleModel: "anthropic/claude-sonnet-4.5",
    keyPlaceholder: "sk-or-…",
  },
  {
    id: "groq",
    name: "Groq",
    description: "Fast open models on Groq's hardware.",
    baseUrl: "https://api.groq.com/openai/v1",
    needsKey: true,
    exampleModel: "llama-3.3-70b-versatile",
    keyPlaceholder: "gsk_…",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "DeepSeek chat and reasoning models.",
    baseUrl: "https://api.deepseek.com",
    needsKey: true,
    exampleModel: "deepseek-chat",
    keyPlaceholder: "sk-…",
  },
  {
    id: "mistral",
    name: "Mistral",
    description: "Mistral and Codestral models through La Plateforme.",
    baseUrl: "https://api.mistral.ai/v1",
    needsKey: true,
    exampleModel: "mistral-large-latest",
    keyPlaceholder: "Mistral API key",
  },
  {
    id: "xai",
    name: "xAI",
    description: "Grok models through the xAI API.",
    baseUrl: "https://api.x.ai/v1",
    needsKey: true,
    exampleModel: "grok-4",
    keyPlaceholder: "xai-…",
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Models running on this machine with Ollama, no key needed.",
    baseUrl: "http://localhost:11434/v1",
    needsKey: false,
    exampleModel: "llama3.1",
    keyPlaceholder: "Not needed",
  },
];

/** The panel a saved provider belongs to, if its address is one of the presets'. */
export function presetOf(provider: {
  kind: string;
  baseUrl: string | null;
}): CompatiblePreset | undefined {
  if (provider.kind !== "openai-compatible") return undefined;
  const address = provider.baseUrl?.replace(/\/+$/, "");
  return COMPATIBLE_PRESETS.find((preset) => preset.baseUrl === address);
}
