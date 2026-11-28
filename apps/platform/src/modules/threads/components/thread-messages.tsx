import { Fragment, useMemo, type ReactNode } from "react";

import { cn } from "cn";

import { Button } from "@aven/ui/button";
import { useTextSize } from "@/modules/theme/hooks/use-text-size";

import { useScrollToBottom } from "../hooks/use-scroll-to-bottom";
import { mergedRuns } from "../merged-runs";
import { sameSpeaker, spaceBefore, speakerOf, steerSpeakerOf } from "../message-spacing";
import type {
  ChatMessage,
  Handoff,
  QueuedSteer,
  SandboxPhase,
  Speaker,
  ThreadPullRequestCheck,
  ToolNarration,
  Viewer,
} from "../types";
import { QueuedMessage } from "./queued-message";
import { RiseIn } from "./rise-in";
import { SandboxPreparationRow } from "./sandbox-preparation-row";
import { ThreadMessage } from "./thread-message";
import { WorkingIndicator } from "./working-indicator";

type Props = {
  threadId: string;
  runtimeId: string;
  projectId: string;
  markColor?: string | null;
  messages: ChatMessage[];
  earlier?: ChatMessage[];
  hidden?: number;
  loadingEarlier?: boolean;
  onLoadEarlier?: () => void;
  handoffs?: Record<string, Handoff>;
  narrations?: Readonly<Record<string, ToolNarration>>;
  sandboxPhase?: SandboxPhase | null;
  prChecks?: readonly ThreadPullRequestCheck[];
  onOpenChanges?: () => void;
  pending?: ChatMessage[];
  steers?: QueuedSteer[];
  running?: boolean;
  viewer: Viewer;
  startedAt?: number | null;
  error?: string | null;
  aside?: ReactNode;
};

export function ThreadMessages({
  threadId,
  runtimeId,
  projectId,
  markColor,
  messages,
  earlier = [],
  hidden = 0,
  loadingEarlier = false,
  onLoadEarlier,
  handoffs = {},
  narrations,
  sandboxPhase = null,
  prChecks,
  onOpenChanges,
  pending = [],
  steers = [],
  running = false,
  viewer,
  startedAt = null,
  error,
  aside,
}: Props) {
  const textSize = useTextSize("thread");
  const sandboxPhaseShown =
    sandboxPhase === "preparing" || (sandboxPhase === "ready" && hidden === 0)
      ? sandboxPhase
      : null;

  const scrollRef = useScrollToBottom(
    messages.length + pending.length + steers.length,
    pending.length + steers.length,
  );
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

  const firstPersonIndex =
    hidden === 0 ? entries.listed.findIndex(({ speaker }) => speaker?.kind === "person") : -1;

  let previous: Speaker | null = null;
  const place = (speaker: Speaker | null) => {
    const space = speaker ? spaceBefore(previous, speaker) : "";
    const first = !sameSpeaker(previous, speaker);

    if (speaker) previous = speaker;

    return { space, first };
  };
  let sandboxSpace = "";
  let afterSandbox = false;
  const listed = entries.listed.map((entry, index) => {
    const placed = place(entry.speaker);
    const space = afterSandbox && entry.speaker?.kind === "agent" ? "mt-1.5" : placed.space;

    if (entry.speaker) afterSandbox = false;

    if (sandboxPhaseShown && index === firstPersonIndex) {
      sandboxSpace = place({ kind: "agent" }).space;
      afterSandbox = true;
    }

    return { ...entry, space, first: placed.first };
  });
  const queued = entries.queued.map((entry) => ({ ...entry, ...place(entry.speaker) }));
  const working = place({ kind: "agent" });

  const onlyFirstTurn =
    firstPersonIndex === -1 ||
    entries.listed.slice(firstPersonIndex + 1).every(({ speaker }) => speaker?.kind !== "person");
  const showWorking = running && !(sandboxPhaseShown === "preparing" && onlyFirstTurn);
  const lastAssistantIndex = listed.findLastIndex(({ message }) => message.role === "assistant");

  return (
    <div
      ref={scrollRef}
      className="h-full scrollbar-gutter-stable overflow-x-hidden overflow-y-auto"
      style={textSize.style}
    >
      <div className="flex">
        <div className="@container min-w-0 flex-1">
          <div className="mx-auto flex max-w-3xl flex-col px-4 pt-16 pb-[calc(var(--composer-height,12rem)+1rem)] [--table-wide:calc(100cqw_-_2rem)]">
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
            {messages.length === 0 && pending.length === 0 && !error && !sandboxPhaseShown && (
              <p className="text-sm text-muted-foreground">Send a message to start.</p>
            )}
            {listed.map(({ message, streaming, sending, space, first }, index) => (
              <Fragment key={handoffs[message.id]?.key ?? message.id}>
                <RiseIn when={sending || streaming} className={space}>
                  <ThreadMessage
                    message={message}
                    threadId={threadId}
                    runtimeId={runtimeId}
                    viewer={viewer}
                    streaming={streaming}
                    sending={sending}
                    previews={handoffs[message.id]?.previews}
                    showAuthor={first}
                    narrations={narrations}
                    prChecks={index === lastAssistantIndex ? prChecks : undefined}
                    onOpenChanges={onOpenChanges}
                  />
                </RiseIn>
                {sandboxPhaseShown && index === firstPersonIndex && (
                  <div className={sandboxSpace}>
                    <SandboxPreparationRow phase={sandboxPhaseShown} />
                  </div>
                )}
              </Fragment>
            ))}
            {sandboxPhaseShown && firstPersonIndex === -1 && (
              <SandboxPreparationRow phase={sandboxPhaseShown} />
            )}
            {queued.map(({ steer, space, first }) => (
              <RiseIn key={steer.id} when className={space}>
                <QueuedMessage
                  message={steer}
                  viewer={viewer}
                  threadId={threadId}
                  showAuthor={first}
                />
              </RiseIn>
            ))}
            <div
              className={cn(
                "min-w-0",
                working.space,
                error && !showWorking ? "empty:hidden" : "min-h-7",
              )}
            >
              <WorkingIndicator
                running={showWorking}
                runtimeId={runtimeId}
                projectId={projectId}
                color={markColor}
                startedAt={startedAt}
              />
            </div>
            {error && (
              <p
                role="alert"
                className="mt-4 min-w-0 break-words rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive"
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
