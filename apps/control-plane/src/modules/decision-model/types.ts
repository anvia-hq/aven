import type { DecisionModel } from "@anvia/core/decision";

import type { AddressingScores } from "../threads/types";

export type DecisionKind = "jev" | "jev-openrouter";

export type DecisionConfig = {
  kind: DecisionKind;
  modelId: string;
  apiKey: string;
};

export type AddressingInput = {
  message: string;
  author: string;
  mentioned: string[];
  participants: string[];
  recent: { author: string; text: string }[];
};

export type AddressingDecider = (input: AddressingInput) => Promise<AddressingScores | null>;

export type AddressingModel = DecisionModel<unknown>;

export type DecisionModelView = { kind: DecisionKind; modelId: string; keyHint: string };
