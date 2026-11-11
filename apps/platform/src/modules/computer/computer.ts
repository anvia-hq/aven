import type { Computer } from "./types";

export const threadComputer = (threadId: string): Computer => ({
  path: `/threads/${threadId}`,
  asleep:
    "The thread's sandbox is not running. It starts when the agent works on this thread, and stops after fifteen idle minutes.",
});

export const botComputer = (botId: string): Computer => ({
  path: `/bots/${botId}`,
  asleep:
    "The bot's computer is not running. It starts when the bot needs it, and stops after fifteen idle minutes.",
});
