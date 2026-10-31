import { Bubble, BubbleContent } from "@/components/bubble";
import { Markdown } from "@/components/markdown";
import { MessageContent } from "@/components/message";

import type { Bot, BotChatMessage } from "../types";
import { MentionedText } from "./mentioned-text";

/** Whether a message is the person's own, which is drawn at the end of the row. */
export const isPersons = (message: BotChatMessage) => message.role === "user";

// One message of a bot's chat with the person. The person's is tinted, at the end, with the bots it
// mentions drawn as chips; the bot's own shows its Markdown. Messages between bots are not bubbles
// (`BotActivity`).
export function BotChatBubble({
  message,
  bots,
}: {
  message: BotChatMessage;
  bots: readonly Bot[];
}) {
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
