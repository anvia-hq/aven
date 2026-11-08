import type { ReactNode } from "react";

import { Button } from "@/components/button";

import { useScrollToBottom } from "../hooks/use-scroll-to-bottom";
import type { ChatMessage, QueuedSteer } from "../types";
import { QueuedMessage } from "./queued-message";
import { ThreadMessage } from "./thread-message";

type Props = {
  threadId: string;
  messages: ChatMessage[];
  earlier?: ChatMessage[];
  hidden?: number;
  loadingEarlier?: boolean;
  onLoadEarlier?: () => void;
  pending?: ChatMessage[];
  steers?: QueuedSteer[];
  running?: boolean;
  error?: string | null;
  aside?: ReactNode;
};

export function ThreadMessages({
  threadId,
  messages,
  earlier = [],
  hidden = 0,
  loadingEarlier = false,
  onLoadEarlier,
  pending = [],
  steers = [],
  running = false,
  error,
  aside,
}: Props) {
  const scrollRef = useScrollToBottom(messages.length + pending.length + steers.length);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      <div className="flex">
        <div className="min-w-0 flex-1">
          <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 pt-5 pb-[calc(var(--composer-height,12rem)+1rem)]">
            {hidden > 0 && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingEarlier}
                  onClick={onLoadEarlier}
                >
                  {loadingEarlier ? "Loading…" : `Show earlier messages (${hidden})`}
                </Button>
              </div>
            )}
            {earlier.map((message) => (
              <ThreadMessage key={message.id} message={message} threadId={threadId} />
            ))}
            {messages.length === 0 && pending.length === 0 && !error && (
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
            {pending.map((message) => (
              <ThreadMessage key={message.id} message={message} threadId={threadId} sending />
            ))}
            {steers.map((steer) => (
              <QueuedMessage key={steer.id} message={steer} />
            ))}
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
