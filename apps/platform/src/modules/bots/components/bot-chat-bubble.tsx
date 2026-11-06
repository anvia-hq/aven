import { Bubble, BubbleContent } from "@/components/bubble";
import { Markdown } from "@/components/markdown";
import { MessageContent } from "@/components/message";
import { SentAttachments } from "@/modules/threads/components/sent-attachments";

import type { Bot, BotChatMessage } from "../types";
import { MentionedText } from "./mentioned-text";

/** Whether a message is the person's own, which is drawn at the end of the row. */
export const isPersons = (message: BotChatMessage) => message.role === "user";

// One message of a bot's chat with the person. The person's is drawn as in a thread, at the end, with the bots it
// mentions drawn as chips; the bot's own shows its Markdown. Messages between bots are not bubbles
// (`BotActivity`).
export function BotChatBubble({
  botId,
  message,
  bots,
}: {
  /** The bot whose chat it is, where the images sent to it are kept. */
  botId: string;
  message: BotChatMessage;
  bots: readonly Bot[];
}) {
  const mine = isPersons(message);
  return (
    <MessageContent>
      {/* The files the person sent with it (decision 0080), above their words as in a thread. */}
      {message.attachments?.length ? (
        <SentAttachments
          artifactsPath={`/api/bots/${botId}/artifacts`}
          attachments={message.attachments}
        />
      ) : null}
      {message.text &&
        (mine ? (
          // The person's own message is drawn as it is in a thread: a plain block at the end.
          <div
            data-role="user"
            className="w-fit max-w-[80%] self-end rounded-lg bg-accent px-3 py-2 text-sm whitespace-pre-wrap"
          >
            <MentionedText text={message.text} bots={bots} />
          </div>
        ) : (
          <Bubble variant="muted" align="start">
            <BubbleContent className="rounded-2xl">
              <Markdown>{message.text}</Markdown>
            </BubbleContent>
          </Bubble>
        ))}
    </MessageContent>
  );
}
