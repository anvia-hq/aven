import type { AgentMemoryOptions, CompletionModel } from "@anvia/core";

import { botInstructions } from "./bot-instruction";
import { createCodingAgent } from "./coding-agent";
import type { ModelConfig } from "./model";
import { createSendMessageTool, type DeliverMessage } from "./tools/send-message";

// A bot answers with a few messages, so a handful of turns is plenty.
export const BOT_MAX_TURNS = 8;

type BotAgentOptions = (ModelConfig | { model: CompletionModel }) & {
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
// `generate`, with no stream, since nothing is shown until it sends something.
export function createBotAgent({
  id,
  name,
  instruction,
  deliver,
  memory,
  compactAfterTokens,
  ...model
}: BotAgentOptions) {
  return createCodingAgent({
    ...model,
    id: `bot-${id}`,
    tools: [createSendMessageTool(deliver)],
    instructions: botInstructions({ name, instruction }),
    webSearch: false,
    questions: false,
    maxTurns: BOT_MAX_TURNS,
    memory,
    compactAfterTokens,
  }).agent;
}
