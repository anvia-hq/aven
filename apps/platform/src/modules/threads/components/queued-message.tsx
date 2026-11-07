import { Markdown } from "@/components/markdown";

import { markMentions } from "../mentions";
import type { QueuedSteer } from "../types";
import { mentionCode } from "./mention-code";

export function QueuedMessage({ message }: { message: QueuedSteer }) {
  return (
    <div className="ml-auto flex max-w-[80%] flex-col items-end gap-1" data-role="user" data-queued>
      <div className="w-fit max-w-full rounded-lg bg-accent/60 px-3 py-2 opacity-70 [&_p]:whitespace-pre-line">
        <Markdown components={{ code: mentionCode }}>
          {markMentions(message.prompt, message.mentions)}
        </Markdown>
      </div>
      <p className="text-xs text-muted-foreground" role="status">
        Queued: the agent reads it at its next step
      </p>
    </div>
  );
}
