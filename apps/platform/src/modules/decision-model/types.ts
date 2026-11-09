export type DecisionKind = "jev" | "jev-openrouter";

export type DecisionModel = { kind: DecisionKind; modelId: string; keyHint: string };

export type DecisionModelDraft = { kind: DecisionKind; modelId: string; apiKey: string };

export type DecisionKindOption = {
  id: DecisionKind;
  label: string;
  defaultModel: string;
  keyLabel: string;
};

export const DECISION_KINDS: DecisionKindOption[] = [
  { id: "jev", label: "Jev", defaultModel: "jev-latest", keyLabel: "TypeSafe API key" },
  {
    id: "jev-openrouter",
    label: "Jev through OpenRouter",
    defaultModel: "typesafe/jev-1.13",
    keyLabel: "OpenRouter API key",
  },
];
