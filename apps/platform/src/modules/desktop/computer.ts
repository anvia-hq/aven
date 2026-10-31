/**
 * The computer a Desktop or Terminal panel shows: a thread's sandbox or a bot's (decision 0059).
 * Both are asked for the same things, at their own paths on the API.
 */
export type Computer = {
  /** Where its desktop, wake-up and terminal are on the API: `/threads/:id` or `/bots/:id`. */
  path: string;
  /** What the person is told when it is not running. */
  asleep: string;
};

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
