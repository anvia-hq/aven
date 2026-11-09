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

export const recentSenders = (messages: readonly ChatMessage[]) => [
  ...new Set(
    messages.slice(-RECENT_MESSAGES).flatMap(({ senderId }) => (senderId ? [senderId] : [])),
  ),
];

export function recentOf(messages: readonly ChatMessage[], names: ReadonlyMap<string, string>) {
  return messages
    .slice(-RECENT_MESSAGES)
    .map(({ role, parts, senderId }) => {
      const written = parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
      const author =
        role === "user"
          ? (senderId && names.get(senderId)) || parseDriverPrompt(written).driver || "person"
          : "agent";
      return { author, text: spoken(written).slice(0, RECENT_CHARACTERS) };
    })
    .filter(({ text }) => text.length > 0);
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
          ...recent.map((message) => message.author).filter((name) => name !== "agent"),
        ]),
      ],
      recent,
    });
    return scores ? addressingFrom(scores) : fallbackAddressing(prompt);
  };
}
