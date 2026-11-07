export type { Bot, BotChatMessage, BotChatPeer, BotEvent, BotQuestion } from "@aven/protocol/bots";

export type BotPatch = {
  name?: string;
  instruction?: string;
  description?: string;
  avatar?: string;
  providerId?: string | null;
  modelId?: string | null;
  reasoningEffort?: string | null;
  compactAfterTokens?: number | null;
};
