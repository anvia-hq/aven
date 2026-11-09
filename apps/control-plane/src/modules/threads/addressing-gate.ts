import { addressingFrom, fallbackAddressing, personMentions } from "./addressing";
import type { AddressingDecider, DecisionConfig } from "../decision-model/types";
import type { AddressingGate } from "./types";

type Deps = {
  configOf(organizationId: string): Promise<DecisionConfig | null>;
  deciderFor(config: DecisionConfig): AddressingDecider;
};

export function createAddressingGate({ configOf, deciderFor }: Deps): AddressingGate {
  return async ({ organizationId, prompt, author, owner, recent }) => {
    const mentioned = personMentions(prompt);
    if (mentioned.length === 0) return { agentAction: true, by: "fallback" };
    const config = await configOf(organizationId).catch(() => null);
    if (!config) return fallbackAddressing(prompt);
    const names = mentioned.map(({ name }) => name);
    const scores = await deciderFor(config)({
      message: prompt,
      author,
      mentioned: names,
      participants: [...new Set([author, owner, ...names])],
      recent,
    });
    return scores ? addressingFrom(scores) : fallbackAddressing(prompt);
  };
}
