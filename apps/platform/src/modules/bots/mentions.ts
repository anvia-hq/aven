import type { Bot, MentionPart } from "./types";

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
  if (last < text.length || parts.length === 0)
    parts.push({ type: "text", text: text.slice(last) });
  return parts;
}
