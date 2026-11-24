import { systemNoteOf } from "@aven/protocol/system-notes";

import { Markdown } from "@/components/markdown";

import { authorOf } from "../message-author";
import { markMentions } from "../mentions";
import type { QueuedSteer, Viewer } from "../types";
import { AuthorLabel } from "./author-label";
import { mentionCode } from "./mention-code";
import { SentAttachments } from "./sent-attachments";
import { UserMessageBubble } from "./user-message-bubble";

export function QueuedMessage({
  message,
  viewer,
  threadId,
  showAuthor = true,
}: {
  message: QueuedSteer;
  viewer: Viewer;
  threadId: string;
  showAuthor?: boolean;
}) {
  const kind = systemNoteOf(message.prompt)?.kind;

  if (kind === "process" || kind === "fork") return null;

  const { mine, name, text } = authorOf(message.prompt, viewer, message.senderId);
  return (
    <div
      className={
        mine
          ? "ml-auto flex max-w-[80%] flex-col items-end gap-1"
          : "mr-auto flex max-w-[80%] flex-col items-start gap-1"
      }
      data-role="user"
      data-author={mine ? "mine" : "other"}
      data-queued
    >
      {!mine && showAuthor && <AuthorLabel name={name} />}
      {message.attachments?.length ? (
        <SentAttachments
          artifactsPath={`/api/threads/${threadId}/artifacts`}
          attachments={message.attachments}
        />
      ) : null}
      {text && (
        <UserMessageBubble>
          <Markdown components={{ code: mentionCode }}>
            {markMentions(text, message.mentions)}
          </Markdown>
        </UserMessageBubble>
      )}
      <p className="text-xs text-muted-foreground" role="status">
        Queued: the agent reads it at its next step
      </p>
    </div>
  );
}
