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

const THREAD_TITLE_CHARS = 60;
const THREAD_MENTION =
  /@\[([^\][()\n]{1,80})\]\(thread:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/g;

export function threadMentionText(id: string, title: string) {
  const plain = title
    .replace(/[\][()\s]+/g, " ")
    .trim()
    .slice(0, THREAD_TITLE_CHARS)
    .trim();
  return `@[${plain || "Untitled thread"}](thread:${id})`;
}

export function splitMentions(text: string, bots: readonly Bot[]): MentionPart[] {
  const parts: MentionPart[] = [];
  let last = 0;
  for (const match of text.matchAll(THREAD_MENTION)) {
    if (match.index > last) parts.push(...splitBotMentions(text.slice(last, match.index), bots));

    parts.push({ type: "thread", id: match[2]!, title: match[1]! });
    last = match.index + match[0].length;
  }

  if (last === 0) return splitBotMentions(text, bots);

  if (last < text.length) parts.push(...splitBotMentions(text.slice(last), bots));

  return parts;
}

const CODE_SPAN = /(```[\s\S]*?```|`[^`\n]*`)/;

const BOT_LINK_PREFIX = "#bot-";

export const botIdOfHref = (href: string | undefined) =>
  href?.startsWith(BOT_LINK_PREFIX) ? href.slice(BOT_LINK_PREFIX.length) : undefined;

export function linkBotMentions(markdown: string, bots: readonly Bot[]) {
  const byName = new Map<string, Bot>();
  for (const bot of bots)
    if (!byName.has(bot.name.toLowerCase())) byName.set(bot.name.toLowerCase(), bot);

  if (byName.size === 0) return markdown;

  const names = [...byName.values()].map((bot) => bot.name).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_@])@(${names.map(escape).join("|")})(?![\\p{L}\\p{N}_])`,
    "giu",
  );

  return markdown
    .split(CODE_SPAN)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(pattern, (whole, name: string) => {
            const bot = byName.get(name.toLowerCase());
            return bot ? `[@${bot.name}](${BOT_LINK_PREFIX}${bot.id})` : whole;
          }),
    )
    .join("");
}
