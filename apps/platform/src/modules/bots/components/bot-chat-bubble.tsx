import { Bubble, BubbleContent } from "@/components/bubble";
import { Markdown } from "@/components/markdown";
import { MessageContent } from "@/components/message";

import type { Bot, BotChatMessage } from "../types";
import { MentionedText } from "./mentioned-text";

/** Whose message it is, for what sits together: the person, the bot, or another bot by its name. */
export const speakerOf = (message: BotChatMessage) =>
  message.from ? `bot:${message.from}` : message.role;

/** Whether a message is the person's own, which is drawn at the end of the row. */
export const isPersons = (message: BotChatMessage) => message.role === "user" && !message.from;

// One message of a bot's chat. The person's is tinted, at the end, with the bots it mentions drawn
// as chips; the bot's own shows its Markdown; one that another bot sent (decision 0063) says who
// it is from and is outlined, so it is neither.
export function BotChatBubble({
  message,
  bots,
}: {
  message: BotChatMessage;
  bots: readonly Bot[];
}) {
  if (message.from) {
    return (
      <MessageContent>
        <span className="text-xs text-muted-foreground">from {message.from}</span>
        <Bubble variant="outline" align="start">
          <BubbleContent className="rounded-2xl">
            <span className="whitespace-pre-wrap">{message.text}</span>
          </BubbleContent>
        </Bubble>
      </MessageContent>
    );
  }
  const mine = isPersons(message);
  return (
    <MessageContent>
      <Bubble variant={mine ? "tinted" : "muted"} align={mine ? "end" : "start"}>
        <BubbleContent className="rounded-2xl">
          {mine ? (
            <span className="whitespace-pre-wrap">
              <MentionedText text={message.text} bots={bots} />
            </span>
          ) : (
            <Markdown>{message.text}</Markdown>
          )}
        </BubbleContent>
      </Bubble>
    </MessageContent>
  );
}
