import { parseDriverPrompt } from "@aven/protocol/drivers";

import {
  addressingFrom,
  fallbackAddressing,
  namesAgent,
  personMentions,
  spoken,
} from "./addressing";
import type { AddressingDecider, DecisionConfig } from "../decision-model/types";
import type { AddressingGate } from "./types";
import type { ChatMessage } from "@aven/protocol/types";

const RECENT_MESSAGES = 4;
const RECENT_CHARACTERS = 300;
const UNKNOWN_AUTHOR = "someone";
const AGENT_AUTHOR = "agent";

export const recentSenders = (messages: readonly ChatMessage[]) => [
  ...new Set(
    messages.slice(-RECENT_MESSAGES).flatMap(({ senderId }) => (senderId ? [senderId] : [])),
  ),
];

export function recentOf(messages: readonly ChatMessage[], names: ReadonlyMap<string, string>) {
  return messages.slice(-RECENT_MESSAGES).flatMap(({ role, parts, senderId }) => {
    const written = parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
    const author =
      role === "user"
        ? (senderId && names.get(senderId)) || parseDriverPrompt(written).driver || UNKNOWN_AUTHOR
        : AGENT_AUTHOR;
    const text = spoken(written).slice(0, RECENT_CHARACTERS);
    return text.length > 0 ? [{ author, text }] : [];
  });
}

type Deps = {
  configOf(organizationId: string): Promise<DecisionConfig | null>;
  deciderFor(config: DecisionConfig): AddressingDecider;
};

export function createAddressingGate({ configOf, deciderFor }: Deps): AddressingGate {
  return async ({ organizationId, prompt, author, owner, recent }) => {
    if (namesAgent(prompt)) return { agentAction: true, by: "fallback" };

    const mentioned = personMentions(prompt);
    const config = await configOf(organizationId).catch(() => null);

    if (!config) return fallbackAddressing(prompt);

    const names = mentioned.map(({ name }) => name);
    const scores = await deciderFor(config)({
      message: spoken(prompt),
      author,
      mentioned: names,
      participants: [
        ...new Set([
          author,
          owner,
          ...names,
          ...recent.flatMap(({ author: name }) =>
            name !== AGENT_AUTHOR && name !== UNKNOWN_AUTHOR ? [name] : [],
          ),
        ]),
      ],
      recent,
    });

    if (!scores) return fallbackAddressing(prompt);

    const addressing = addressingFrom(scores);
    console.info(
      `The decision model gave ${scores.toPerson.toFixed(2)} to a person for a message of ${author}: ${addressing.agentAction ? "the agent answers" : "left to the person"}`,
    );
    return addressing;
  };
}
