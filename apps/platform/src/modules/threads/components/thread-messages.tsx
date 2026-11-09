import { useMemo, type ReactNode } from "react";

import { Button } from "@/components/button";

import { useScrollToBottom } from "../hooks/use-scroll-to-bottom";
import { mergedRuns } from "../merged-runs";
import type { ChatMessage, QueuedSteer, Viewer } from "../types";
import { BackgroundChip } from "./background-chip";
import { QueuedMessage } from "./queued-message";
import { ThreadMessage } from "./thread-message";
import { WorkingIndicator } from "./working-indicator";

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
  owned?: boolean;
  viewer: Viewer;
  startedAt?: number | null;
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
  owned = false,
  viewer,
  startedAt = null,
  error,
  aside,
}: Props) {
  const scrollRef = useScrollToBottom(messages.length + pending.length + steers.length);
  const earlierRuns = useMemo(() => mergedRuns(earlier, false), [earlier]);
  const runs = useMemo(() => mergedRuns(messages, running), [messages, running]);

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
            {earlierRuns.map((message) => (
              <ThreadMessage
                key={message.id}
                message={message}
                threadId={threadId}
                viewer={viewer}
              />
            ))}
            {messages.length === 0 && pending.length === 0 && !error && (
              <p className="text-sm text-muted-foreground">Send a message to start.</p>
            )}
            {runs.map((message, index) => (
              <ThreadMessage
                key={message.id}
                message={message}
                threadId={threadId}
                viewer={viewer}
                streaming={running && index === runs.length - 1}
              />
            ))}
            {pending.map((message) => (
              <ThreadMessage
                key={message.id}
                message={message}
                threadId={threadId}
                viewer={viewer}
                sending
              />
            ))}
            {steers.map((steer) => (
              <QueuedMessage key={steer.id} message={steer} viewer={viewer} />
            ))}
            <WorkingIndicator running={running} startedAt={startedAt} />
            {owned && <BackgroundChip threadId={threadId} running={running} />}
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
