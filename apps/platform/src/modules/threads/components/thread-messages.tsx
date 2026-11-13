import { useMemo, type ReactNode } from "react";

import { cn } from "cn";

import { Button } from "@/components/button";

import { useScrollToBottom } from "../hooks/use-scroll-to-bottom";
import { mergedRuns } from "../merged-runs";
import { sameSpeaker, spaceBefore, speakerOf, steerSpeakerOf } from "../message-spacing";
import type { ChatMessage, QueuedSteer, Speaker, Viewer } from "../types";
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
  const earlierRuns = useMemo(
    () => mergedRuns(earlier, false, { after: messages[0] }),
    [earlier, messages],
  );
  const runs = useMemo(
    () => mergedRuns(messages, running, { before: earlier.at(-1) }),
    [messages, running, earlier],
  );
  const entries = useMemo(() => {
    const listed = [
      ...earlierRuns.map((message) => ({ message, streaming: false, sending: false })),
      ...runs.map((message, index) => ({
        message,
        streaming: running && index === runs.length - 1,
        sending: false,
      })),
      ...pending.map((message) => ({ message, streaming: false, sending: true })),
    ].map((entry) => ({ ...entry, speaker: speakerOf(entry.message, viewer, entry.sending) }));
    const queued = steers.map((steer) => ({ steer, speaker: steerSpeakerOf(steer, viewer) }));
    return { listed, queued };
  }, [earlierRuns, runs, pending, steers, running, viewer]);

  let previous: Speaker | null = null;
  const place = (speaker: Speaker | null) => {
    const space = speaker ? spaceBefore(previous, speaker) : "";
    const first = !sameSpeaker(previous, speaker);

    if (speaker) previous = speaker;

    return { space, first };
  };
  const listed = entries.listed.map((entry) => ({ ...entry, ...place(entry.speaker) }));
  const queued = entries.queued.map((entry) => ({ ...entry, ...place(entry.speaker) }));
  const working = place({ kind: "agent" });

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      <div className="flex">
        <div className="min-w-0 flex-1">
          <div className="mx-auto flex max-w-4xl flex-col px-4 pt-5 pb-[calc(var(--composer-height,12rem)+1rem)]">
            {hidden > 0 && (
              <div className="flex justify-center pb-4">
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
            {messages.length === 0 && pending.length === 0 && !error && (
              <p className="text-sm text-muted-foreground">Send a message to start.</p>
            )}
            {listed.map(({ message, streaming, sending, space, first }) => (
              <div key={message.id} className={space}>
                <ThreadMessage
                  message={message}
                  threadId={threadId}
                  viewer={viewer}
                  streaming={streaming}
                  sending={sending}
                  showAuthor={first}
                />
              </div>
            ))}
            {queued.map(({ steer, space, first }) => (
              <div key={steer.id} className={space}>
                <QueuedMessage
                  message={steer}
                  viewer={viewer}
                  threadId={threadId}
                  showAuthor={first}
                />
              </div>
            ))}
            <div className={cn(working.space, "empty:hidden")}>
              <WorkingIndicator running={running} startedAt={startedAt} />
            </div>
            {owned && (
              <div className="mt-4 empty:hidden">
                <BackgroundChip threadId={threadId} running={running} />
              </div>
            )}
            {error && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-destructive/40 px-4 py-3 text-sm text-destructive"
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
