import type { ReactNode } from "react";

import { useScrollToBottom } from "../hooks/use-scroll-to-bottom";
import type { ChatMessage, QueuedSteer } from "../types";
import { QueuedMessage } from "./queued-message";
import { ThreadMessage } from "./thread-message";
import { WorkingIndicator } from "./working-indicator";

type Props = {
  threadId: string;
  messages: ChatMessage[];
  /** What the person said while the agent worked, which it has not read yet (decision 0098). */
  steers?: QueuedSteer[];
  /** The agent is writing the last message. */
  running?: boolean;
  /** When the run in progress started (`Date.now()`), for the time shown beside the indicator. */
  startedAt?: number | null;
  error?: string | null;
  /** Stays beside the conversation while it scrolls, so the scrollbar is at the panel's edge. */
  aside?: ReactNode;
};

export function ThreadMessages({
  threadId,
  messages,
  steers = [],
  running = false,
  startedAt = null,
  error,
  aside,
}: Props) {
  const scrollRef = useScrollToBottom(messages.length + steers.length);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      <div className="flex">
        <div className="min-w-0 flex-1">
          {/* The bottom padding clears the composer; WorkingIndicator's `bottom-48` matches it. */}
          <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 pt-5 pb-48">
            {messages.length === 0 && !error && (
              <p className="text-sm text-muted-foreground">Send a message to start.</p>
            )}
            {messages.map((message, index) => (
              <ThreadMessage
                key={message.id}
                message={message}
                threadId={threadId}
                streaming={running && index === messages.length - 1}
              />
            ))}
            {steers.map((steer) => (
              <QueuedMessage key={steer.id} message={steer} />
            ))}
            {running && <WorkingIndicator startedAt={startedAt} />}
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/40 px-4 py-3 text-sm text-destructive"
              >
                {error}
              </p>
            )}
          </div>
        </div>
        {aside}
      </div>
    </div>
  );
}
