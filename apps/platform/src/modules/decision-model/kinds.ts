import { DECISION_DEFAULT_MODELS } from "@aven/protocol/decision-model";
import type { DecisionKindOption } from "./types";

export const DECISION_KINDS: DecisionKindOption[] = [
  {
    id: "jev",
    label: "Jev",
    defaultModel: DECISION_DEFAULT_MODELS.jev,
    keyLabel: "TypeSafe API key",
  },
  {
    id: "jev-openrouter",
    label: "Jev through OpenRouter",
    defaultModel: DECISION_DEFAULT_MODELS["jev-openrouter"],
    keyLabel: "OpenRouter API key",
  },
];
