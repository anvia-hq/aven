import { systemNoteOf } from "@aven/protocol/system-notes";

import { Markdown } from "@/components/markdown";

import { authorOf } from "../message-author";
import { markMentions } from "../mentions";
import type { QueuedSteer, Viewer } from "../types";
import { AuthorLabel } from "./author-label";
import { mentionCode } from "./mention-code";

export function QueuedMessage({
  message,
  viewer,
  showAuthor = true,
}: {
  message: QueuedSteer;
  viewer: Viewer;
  showAuthor?: boolean;
}) {
  if (systemNoteOf(message.prompt)?.kind === "process") return null;
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
      <div className="w-fit max-w-full rounded-lg bg-accent/60 px-3 py-2 opacity-70 [&_p]:whitespace-pre-line">
        <Markdown components={{ code: mentionCode }}>
          {markMentions(text, message.mentions)}
        </Markdown>
      </div>
      <p className="text-xs text-muted-foreground" role="status">
        Queued: the agent reads it at its next step
      </p>
    </div>
  );
}
