import type { DecisionConfig, FollowUpDecider } from "../decision-model/types";

export const SUGGEST_THRESHOLD = 0.5;
export const MIN_REPLY_CHARACTERS = 40;

type Deps = {
  configOf(organizationId: string): Promise<DecisionConfig | null>;
  deciderFor(config: DecisionConfig): FollowUpDecider;
};

export function createFollowUpGate({ configOf, deciderFor }: Deps) {
  return async (organizationId: string, reply: string, transcript: string) => {
    if (reply.trim().length < MIN_REPLY_CHARACTERS) return false;

    const config = await configOf(organizationId).catch(() => null);

    if (!config) return true;

    const score = await deciderFor(config)({ transcript });

    return score === null || score >= SUGGEST_THRESHOLD;
  };
}
