import { Bubble, BubbleContent } from "@/components/bubble";
import { Markdown } from "@/components/markdown";
import { MessageContent } from "@/components/message";
import { SentAttachments } from "@/modules/threads/components/sent-attachments";

import type { Bot, BotChatMessage } from "../types";
import { MentionedText } from "./mentioned-text";

export const isPersons = (message: BotChatMessage) => message.role === "user";

export function BotChatBubble({
  botId,
  message,
  bots,
}: {
  botId: string;
  message: BotChatMessage;
  bots: readonly Bot[];
}) {
  const mine = isPersons(message);
  return (
    <MessageContent>
      {message.attachments?.length ? (
        <SentAttachments
          artifactsPath={`/api/bots/${botId}/artifacts`}
          attachments={message.attachments}
        />
      ) : null}
      {message.text &&
        (mine ? (
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
