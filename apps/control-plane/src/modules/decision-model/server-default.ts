import { DEFAULT_MODEL } from "./jev";
import type { DecisionConfig, DecisionKind } from "./types";

const KINDS = Object.keys(DEFAULT_MODEL) as DecisionKind[];

export function serverDecisionModel(
  env: Record<string, string | undefined>,
): DecisionConfig | null {
  const apiKey = env.DECISION_MODEL_API_KEY?.trim();

  if (!apiKey) return null;

  const kind = env.DECISION_MODEL_KIND?.trim() || "jev-openrouter";

  if (!KINDS.includes(kind as DecisionKind)) {
    throw new Error(`DECISION_MODEL_KIND must be one of ${KINDS.join(", ")}, got "${kind}"`);
  }

  return {
    kind: kind as DecisionKind,
    modelId: env.DECISION_MODEL_ID?.trim() || DEFAULT_MODEL[kind as DecisionKind],
    apiKey,
  };
}
