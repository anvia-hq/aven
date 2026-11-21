import type { DecisionKind } from "./types";

export const DECISION_KINDS = ["jev", "jev-openrouter"] as const;

export const DECISION_DEFAULT_MODELS: Record<DecisionKind, string> = {
  jev: "jev-latest",
  "jev-openrouter": "typesafe/jev-1.13",
};

export const SMALL_MODEL_PROVIDERS = ["anthropic", "openai", "gemini"] as const;
