import type { Provider } from "@aven/protocol/runtime-wire";

// The model a provider runs when none is named; `azure` and `openai-compatible` have none, since
// every resource and server names its own. Apart from `model.ts` so it loads no provider SDK.
export const DEFAULT_MODEL_IDS = {
  openai: "gpt-5.6",
  anthropic: "claude-sonnet-5",
  gemini: "gemini-2.5-pro",
} as const satisfies Partial<Record<Provider, string>>;
