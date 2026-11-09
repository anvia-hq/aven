import type { DecisionKindOption } from "./types";

export const DECISION_KINDS: DecisionKindOption[] = [
  { id: "jev", label: "Jev", defaultModel: "jev-latest", keyLabel: "TypeSafe API key" },
  {
    id: "jev-openrouter",
    label: "Jev through OpenRouter",
    defaultModel: "typesafe/jev-1.13",
    keyLabel: "OpenRouter API key",
  },
];
