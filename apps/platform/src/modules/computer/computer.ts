import type { Computer } from "./types";

export const threadComputer = (threadId: string): Computer => ({
  path: `/threads/${threadId}`,
  asleep: "The thread's folder is not ready. It is made when the agent first works on this thread.",
});

export const botComputer = (botId: string): Computer => ({
  path: `/bots/${botId}`,
  asleep: "The bot's folder is not ready. It is made when the bot first needs it.",
});
