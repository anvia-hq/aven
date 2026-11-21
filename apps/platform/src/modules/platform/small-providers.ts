import type { ServerModelOption, SmallModelProvider } from "./types";

type SmallProviderOption = ServerModelOption & { id: SmallModelProvider };

export const SMALL_PROVIDERS: SmallProviderOption[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    defaultModel: "claude-haiku-5-5",
    keyLabel: "Anthropic API key",
  },
  { id: "openai", label: "OpenAI", defaultModel: "a mini model", keyLabel: "OpenAI API key" },
  { id: "gemini", label: "Gemini", defaultModel: "a flash model", keyLabel: "Gemini API key" },
];
