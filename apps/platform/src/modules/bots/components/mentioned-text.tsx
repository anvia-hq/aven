import { splitBotMentions } from "../mentions";
import type { Bot } from "../types";
import { BotMentionChip } from "./bot-mention-chip";

/** What the person sent, with each `@Name` of one of their bots drawn as the bot's chip. */
export function MentionedText({ text, bots }: { text: string; bots: readonly Bot[] }) {
  return splitBotMentions(text, bots).map((part, index) =>
    part.type === "text" ? part.text : <BotMentionChip key={index} bot={part.bot} />,
  );
}
