// What a bot and its chat are is the wire protocol, shared with the control plane.
export type { Bot, BotChatMessage, BotEvent } from "@aven/protocol/bots";

/** What can be changed about a bot; what is left out stays. */
export type BotPatch = {
  name?: string;
  instruction?: string;
  description?: string;
  avatar?: string;
  /** Null puts the bot back on the person's default model. */
  providerId?: string | null;
  modelId?: string | null;
  /** A level of the bot's model; changing the model drops it. */
  reasoningEffort?: string | null;
  /** Tokens past which the chat is summarized; null leaves it to the model. */
  compactAfterTokens?: number | null;
};
