import type { ReactNode } from "react";

import { useScrollToBottom } from "../hooks/use-scroll-to-bottom";
import type { ChatMessage } from "../types";
import { ThreadMessage } from "./thread-message";
import { WorkingIndicator } from "./working-indicator";

type Props = {
  messages: ChatMessage[];
  /** The agent is writing the last message. */
  running?: boolean;
  error?: string | null;
  /** Stays beside the conversation while it scrolls, so the scrollbar is at the panel's edge. */
  aside?: ReactNode;
};

export function ThreadMessages({ messages, running = false, error, aside }: Props) {
  const scrollRef = useScrollToBottom(messages.length);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      <div className="flex">
        <div className="min-w-0 flex-1">
          <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 pt-5 pb-48">
            {messages.length === 0 && !error && (
              <p className="text-sm text-muted-foreground">Send a message to start.</p>
            )}
            {messages.map((message, index) => (
              <ThreadMessage
                key={message.id}
                message={message}
                streaming={running && index === messages.length - 1}
              />
            ))}
            {running && <WorkingIndicator />}
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
