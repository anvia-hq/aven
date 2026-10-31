import { Agent, type AgentMemoryOptions, type AnyTool } from "@anvia/core";

import { compactionFor, resolveAgentModel, type ModelSource } from "./agent-model";
import { botInstructions } from "./bot-instruction";
import { createCreateBotTool, type CreateBot } from "./tools/create-bot";
import { createSendMessageTool, type DeliverMessage } from "./tools/send-message";

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
    }),
    maxTurns: computer.length > 0 ? BOT_COMPUTER_MAX_TURNS : BOT_MAX_TURNS,
    memory: compaction ? { ...memory, compaction } : memory,
    tools: [createSendMessageTool(deliver), ...computer, ...makingBots(createBot)],
  });
}

const makingBots = (createBot?: CreateBot) => (createBot ? [createCreateBotTool(createBot)] : []);
