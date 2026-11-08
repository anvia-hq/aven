import { splitMentions } from "../mentions";
import type { Bot } from "../types";
import { BotMentionChip } from "./bot-mention-chip";
import { ThreadMentionChip } from "./thread-mention-chip";

export function MentionedText({ text, bots }: { text: string; bots: readonly Bot[] }) {
  return splitMentions(text, bots).map((part, index) => {
    if (part.type === "text") return part.text;
    if (part.type === "thread") {
      return <ThreadMentionChip key={index} id={part.id} title={part.title} link />;
    }
    return <BotMentionChip key={index} bot={part.bot} />;
  });
}
