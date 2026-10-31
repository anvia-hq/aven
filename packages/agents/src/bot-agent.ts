import { Agent, type AgentMemoryOptions } from "@anvia/core";

import { compactionFor, resolveAgentModel, type ModelSource } from "./agent-model";
import { botInstructions } from "./bot-instruction";
import { createSendMessageTool, type DeliverMessage } from "./tools/send-message";

// A bot answers with a few messages, so a handful of turns is plenty.
export const BOT_MAX_TURNS = 8;

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
};

// A bot is an agent with one tool: it talks by sending messages (decision 0058). It runs through
// `generate`, with no stream, since nothing is shown until it sends something. It keeps its own
// conversation, and summarizes it past a size so the chat can go on.
export function createBotAgent({
  id,
  name,
  instruction,
  deliver,
  memory,
  compactAfterTokens,
  ...source
}: BotAgentOptions) {
  const agentModel = resolveAgentModel(source);
  const compaction = compactionFor(source, agentModel.model, compactAfterTokens);
  return new Agent({
    ...agentModel,
    id: `bot-${id}`,
    instructions: botInstructions({ name, instruction }),
    maxTurns: BOT_MAX_TURNS,
    memory: compaction ? { ...memory, compaction } : memory,
    tools: [createSendMessageTool(deliver)],
  });
}
