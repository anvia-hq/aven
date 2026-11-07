import type { Provider } from "@aven/protocol/runtime-wire";

export const DEFAULT_MODEL_IDS = {
  openai: "gpt-5.6",
  anthropic: "claude-sonnet-5",
  gemini: "gemini-2.5-pro",
} as const satisfies Partial<Record<Provider, string>>;
