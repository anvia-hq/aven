import type { DecisionKind } from "@aven/protocol/types";

export type { DecisionKind };

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
