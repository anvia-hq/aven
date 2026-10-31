import type { Bot } from "./types";

/** A message's text cut where it mentions a bot: `@Name`, the name of one of the person's bots. */
export type MentionPart =
  | { type: "text"; text: string }
  | { type: "mention"; bot: Pick<Bot, "id" | "name" | "avatar"> };

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Cuts `text` at each `@Name` that is a bot's. A name can hold spaces, so the names are what is
 * looked for, the longest first so `@Data Analyst` is not read as `@Data`; a mention stands at the
 * start of the text or after a space, and ends where the name does, not in the middle of a word.
 */
export function splitBotMentions(text: string, bots: readonly Bot[]): MentionPart[] {
  const byName = new Map<string, Bot>();
  for (const bot of bots)
    if (!byName.has(bot.name.toLowerCase())) byName.set(bot.name.toLowerCase(), bot);
  if (byName.size === 0) return [{ type: "text", text }];

  const names = [...byName.values()].map((bot) => bot.name).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(^|\\s)@(${names.map(escape).join("|")})(?![\\p{L}\\p{N}_])`, "giu");
  const parts: MentionPart[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const bot = byName.get(match[2]!.toLowerCase());
    if (!bot) continue;
    const start = match.index + match[1]!.length;
    if (start > last) parts.push({ type: "text", text: text.slice(last, start) });
    parts.push({ type: "mention", bot });
    last = start + 1 + match[2]!.length;
  }
  // Whatever is left, and the text itself when it has no mention, even an empty one.
  if (last < text.length || parts.length === 0)
    parts.push({ type: "text", text: text.slice(last) });
  return parts;
}
