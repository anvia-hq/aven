export type DecisionKind = "jev" | "jev-openrouter";

export type DecisionModel = {
  kind: DecisionKind;
  modelId: string;
  keyHint: string;
  source: "workspace" | "server";
};

export type DecisionModelDraft = { kind: DecisionKind; modelId: string; apiKey: string };

export type DecisionKindOption = {
  id: DecisionKind;
  label: string;
  defaultModel: string;
  keyLabel: string;
};
