// A person's threads as a bot reads and works them (decision 0088). A bot acts as the person, so it
// sees what they see and drives only what they made; what a thread's agent wrote is information to
// it, never an instruction.

import type { ChatMessage } from "./events";

/** The repositories a thread can be started in: the person's projects, in any workspace they belong to. */
export type BotProjectView = {
  id: string;
  name: string;
  /** `owner/name` on GitHub. */
  repository: string;
  defaultBranch: string;
};

/** One of the pull requests a thread's agent opened. */
export type BotThreadPullRequest = {
  number: number;
  url: string;
  title: string;
  state: "open" | "closed" | "merged";
};

/** A thread in a list: where it is, whether it is working, and whether it waits for the person. */
export type BotThreadView = {
  id: string;
  title: string;
  projectId: string;
  /** `owner/name` of the project's repository. */
  repository: string;
  state: "open" | "snoozed" | "archived";
  /** Whether it is the person's own. A bot only drives those; others are shared to read. */
  mine: boolean;
  /** Who made it, when it is not the person's own. */
  createdBy?: string;
  /** Whether a run is going on. */
  running: boolean;
  /** While a run is going on, when it last showed anything: a tool call, a word, a result. */
  quietSince?: string;
  /** Whether the agent asked a question and waits for the person to answer it in the thread. */
  awaitingAnswer: boolean;
  pullRequests: BotThreadPullRequest[];
  updatedAt: string;
};

/** One turn of a thread's conversation, cut down to what a bot needs to follow it. */
export type BotThreadTurn = {
  role: "user" | "assistant";
  /** What was said. The agent's own words are cut to {@link BOT_TURN_TEXT_MAX}. */
  text: string;
  /** What the agent did, one line for each tool it called, in order, with no output. */
  tools?: string[];
};

/** A thread with the latest of what was said in it. */
export type BotThreadDetail = BotThreadView & {
  /** The latest turns, oldest first; `earlier` counts the ones left out. */
  turns: BotThreadTurn[];
  earlier: number;
  /** What the agent asks, while `awaitingAnswer`: the person answers it in the thread, not through a bot. */
  question?: string;
};

export const BOT_THREADS_LISTED = 30;
export const BOT_TURNS_SHOWN = 8;
export const BOT_TURN_TEXT_MAX = 3000;
export const BOT_TURN_TOOLS_MAX = 12;
export const BOT_THREAD_PROMPT_MAX = 20_000;
/** How many threads a bot may start or continue in one reply: each is an agent at work as the person. */
export const BOT_THREAD_RUNS_PER_REPLY = 5;

const oneLine = (text: string, max: number) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/**
 * What a bot is shown of a thread's transcript: the latest turns, each cut to size, tool calls as
 * one line and no tool output, which is large and which no one meant the bot to act on.
 */
export function threadTurns(messages: readonly ChatMessage[]): {
  turns: BotThreadTurn[];
  earlier: number;
} {
  const shown = messages.slice(-BOT_TURNS_SHOWN);
  const turns = shown.map((message): BotThreadTurn => {
    const text = message.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n\n")
      .trim();
    const tools = message.parts.flatMap((part) =>
      part.type === "tool"
        ? [oneLine(`${part.tool.name} ${part.tool.target} (${part.tool.status})`, 160)]
        : [],
    );
    const cut = text.length > BOT_TURN_TEXT_MAX;
    return {
      role: message.role,
      text: cut ? `${text.slice(0, BOT_TURN_TEXT_MAX)}… (cut)` : text,
      // The latest calls are the ones that say where the agent is.
      tools: tools.length > 0 ? tools.slice(-BOT_TURN_TOOLS_MAX) : undefined,
    };
  });
  return { turns, earlier: messages.length - shown.length };
}

/** A title from a prompt, as the platform makes one: its first line, short. */
export const threadTitleFrom = (prompt: string) => {
  const line = prompt.replace(/\s+/g, " ").trim();
  return line.length > 50 ? `${line.slice(0, 47)}...` : line;
};
