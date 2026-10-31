// A bot (decision 0058): a named agent a person talks to in a chat of its own. Types and limits
// shared by the control plane and the platform.

export const BOT_NAME_MAX = 60;
export const BOT_INSTRUCTION_MAX = 4000;
export const BOT_AVATAR_MAX = 16;

export type Bot = {
  id: string;
  name: string;
  /** What the person told the bot to be like; the bot's own rules for messaging come on top of it. */
  instruction: string;
  /** A short string, an emoji; empty shows the name's first letter. */
  avatar: string;
  /** The person's main bot: the one they always have. */
  isMain: boolean;
  createdAt: string;
  updatedAt: string;
};
