import type { BotThreadTurn, ChatMessage } from "./types";

export const BOT_THREADS_LISTED = 30;
export const BOT_TURNS_SHOWN = 8;
export const BOT_TURN_TEXT_MAX = 3000;
export const BOT_TURN_TOOLS_MAX = 12;
export const BOT_THREAD_PROMPT_MAX = 20_000;
export const BOT_THREAD_RUNS_PER_REPLY = 5;
export const THREAD_TITLE_MAX = 200;
export const THREAD_ARCHIVE_AFTER_DAYS = 30;

const oneLine = (text: string, max: number) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

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
      tools: tools.length > 0 ? tools.slice(-BOT_TURN_TOOLS_MAX) : undefined,
    };
  });
  return { turns, earlier: messages.length - shown.length };
}

export const threadTitleFrom = (prompt: string) => {
  const line = prompt.replace(/\s+/g, " ").trim();
  return line.length > 50 ? `${line.slice(0, 47)}...` : line;
};
