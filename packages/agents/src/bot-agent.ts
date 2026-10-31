import { Agent, type AgentMemoryOptions, type AnyTool } from "@anvia/core";
import type { BotPeer } from "@aven/protocol/runtime-wire";

import { compactionFor, resolveAgentModel, type ModelSource } from "./agent-model";
import { botInstructions } from "./bot-instruction";
import { createCreateBotTool, type CreateBot } from "./tools/create-bot";
import { createMessageBotTool, type MessageBot } from "./tools/message-bot";
import { createSendMessageTool, type DeliverMessage } from "./tools/send-message";
import { createUpdateSelfTool, type UpdateSelf } from "./tools/update-self";

// A bot answers with a few messages, so a handful of turns is plenty.
export const BOT_MAX_TURNS = 8;

// A bot with a computer also works on it between its messages.
export const BOT_COMPUTER_MAX_TURNS = 30;

type BotAgentOptions = ModelSource & {
  /** The bot's id: its conversation is kept under it. */
  id: string;
  name: string;
  instruction: string;
  /** Shows a message the bot sent. */
  deliver: DeliverMessage;
  /** Where the conversation is kept. */
  memory: AgentMemoryOptions;
  /** The size of the conversation, in tokens, past which it is summarized; by default 70% of the model's window. */
  compactAfterTokens?: number;
  /** What the bot can do on its computer, supplied by the host that runs it (decision 0059). Without any, it only talks. */
  computer?: readonly AnyTool[];
  /** Makes another bot, for the person's main bot only (decision 0060); without it the bot cannot. */
  createBot?: CreateBot;
  /** Writes to another of the person's bots, for the main bot only (decision 0063); without it the bot cannot. */
  messageBot?: MessageBot;
  /** The person's other bots, which the instructions list for a bot that can write to them. */
  peers?: readonly BotPeer[];
  /** What the bot's description is now. */
  description?: string;
  /** Changes this bot's own name, description or instruction (decision 0061); without it the bot cannot. */
  updateSelf?: UpdateSelf;
};

// A bot is an agent that talks by sending messages (decision 0058), and works on its computer when
// the host gives it one (decision 0059). It runs through
// `generate`, with no stream, since nothing is shown until it sends something. It keeps its own
// conversation, and summarizes it past a size so the chat can go on.
export function createBotAgent({
  id,
  name,
  instruction,
  deliver,
  memory,
  compactAfterTokens,
  computer = [],
  createBot,
  messageBot,
  peers = [],
  description = "",
  updateSelf,
  ...source
}: BotAgentOptions) {
  const agentModel = resolveAgentModel(source);
  const compaction = compactionFor(source, agentModel.model, compactAfterTokens);
  return new Agent({
    ...agentModel,
    id: `bot-${id}`,
    instructions: botInstructions({
      name,
      instruction,
      computer: computer.length > 0,
      createBots: Boolean(createBot),
      peers: messageBot ? peers : undefined,
      self: updateSelf ? { description } : undefined,
    }),
    maxTurns: computer.length > 0 ? BOT_COMPUTER_MAX_TURNS : BOT_MAX_TURNS,
    memory: compaction ? { ...memory, compaction } : memory,
    tools: [
      createSendMessageTool(deliver),
      ...computer,
      ...makingBots(createBot),
      ...messagingBots(messageBot),
      ...changingSelf(updateSelf),
    ],
  });
}

const makingBots = (createBot?: CreateBot) => (createBot ? [createCreateBotTool(createBot)] : []);
const changingSelf = (updateSelf?: UpdateSelf) =>
  updateSelf ? [createUpdateSelfTool(updateSelf)] : [];
const messagingBots = (messageBot?: MessageBot) =>
  messageBot ? [createMessageBotTool(messageBot)] : [];
