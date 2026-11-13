import { useState } from "react";
import { useDefaultLayout } from "react-resizable-panels";

import { backendSupports } from "@aven/protocol/runtime-wire";
import { cn } from "cn";

import { NotFound } from "@/components/not-found";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/resizable";
import { safeStorage } from "@/hooks/use-local-storage";
import { useMediaQuery } from "@/hooks/use-media-query";
import { GAP_HANDLE } from "@/lib/panel-layout";
import { useThreadDiff } from "@/modules/diff/hooks/use-thread-diff";
import { OverviewColumn } from "@/modules/overview/components/overview-column";
import { ProjectInfo } from "@/modules/projects/components/project-info";
import { PromptInput } from "@/modules/threads/components/prompt-input";
import { AnswerForm } from "@/modules/threads/components/answer-form";
import { SharedNotice } from "@/modules/threads/components/shared-notice";
import { ShipBar } from "@/modules/threads/components/ship-bar";
import { FollowUpChips } from "@/modules/threads/components/follow-up-chips";
import { ThreadHeader } from "@/modules/threads/components/thread-header";
import { ThreadMessages } from "@/modules/threads/components/thread-messages";
import { ThreadSidePanels } from "@/modules/threads/components/thread-side-panels";
import { useCompactThread } from "@/modules/threads/hooks/use-compact-thread";
import { useElementHeight } from "@/modules/threads/hooks/use-element-height";
import { useFirstPrompt } from "@/modules/threads/hooks/use-first-prompt";
import { useFollowUps } from "@/modules/threads/hooks/use-follow-ups";
import { useModelSelection } from "@/modules/threads/hooks/use-model-selection";
import { useThread } from "@/modules/threads/hooks/use-thread";
import { useThreadPanels } from "@/modules/threads/hooks/use-thread-panels";
import type { ClaudeChoice } from "@/modules/threads/types";

type Props = { threadId: string; split?: boolean; onClose?: () => void };

export function ThreadPane({ threadId, split, onClose }: Props) {
  const {
    thread,
    owned,
    viewer,
    driven,
    loaded,
    messages,
    earlier,
    hidden,
    loadingEarlier,
    loadEarlier,
    pending,
    steers,
    running,
    startedAt,
    usage,
    synced,
    error,
    question,
    send,
    showShip,
    answer,
    cancel,
  } = useThread(threadId);
  useFirstPrompt(threadId, send);
  const followUps = useFollowUps(threadId, loaded, running, messages);
  const { selection } = useModelSelection(threadId);
  const [claudeChoice, setClaudeChoice] = useState<ClaudeChoice | null>({});
  const { compacting, compact } = useCompactThread(threadId);
  const supportsCompaction = backendSupports(thread?.agentBackend, "compaction");
  const canCompact = owned && !running && !question && supportsCompaction;
  const wide = useMediaQuery("(min-width: 1024px)");
  const panels = useThreadPanels(threadId);
  const { overview, diff, files, terminal, preview } = panels;
  const sideOpen =
    !split && (diff.open || files.open || (owned && (terminal.open || preview.open)));
  const panelIds = sideOpen ? ["conversation", "side"] : ["conversation"];
  const unshipped = useThreadDiff(threadId, "unshipped", running);
  const layout = useDefaultLayout({
    id: `aven.thread.${threadId}.panels.${wide ? "row" : "column"}`,
    panelIds,
    storage: safeStorage,
  });

  const { source: composer, target: conversation } = useElementHeight<
    HTMLDivElement,
    HTMLDivElement
  >("--composer-height", loaded && thread !== undefined);

  if (!loaded) return null;

  if (!thread) {
    return <NotFound title="Thread not found" to="/threads" back="Back to threads" />;
  }

  const chips = (
    <FollowUpChips
      suggestions={followUps.suggestions}
      onPick={(prompt) => {
        followUps.clear();
        void send({ prompt, attachments: [], mentions: [] }, selection);
      }}
    />
  );

  return (
    <div className="flex h-[calc(100svh-var(--mobile-chrome))] min-w-0 flex-col md:h-[calc(100svh-1rem)]">
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup
          orientation={wide ? "horizontal" : "vertical"}
          defaultLayout={layout.defaultLayout}
          onLayoutChanged={layout.onLayoutChanged}
        >
          <ResizablePanel id="conversation" defaultSize="50" minSize="30">
            <div
              className={cn(
                "@container flex h-full min-w-0 flex-col overflow-clip bg-background md:rounded-xl md:border md:border-sidebar-border",
              )}
            >
              <ThreadHeader thread={thread} panels={panels} owned={owned} onClose={onClose} />
              <div ref={conversation} className="relative min-h-0 flex-1">
                <ThreadMessages
                  threadId={thread.id}
                  messages={messages}
                  earlier={earlier}
                  hidden={hidden}
                  loadingEarlier={loadingEarlier}
                  onLoadEarlier={() => void loadEarlier()}
                  pending={pending}
                  steers={steers}
                  running={running}
                  owned={owned}
                  viewer={viewer}
                  startedAt={startedAt}
                  error={error}
                  aside={
                    overview.open &&
                    !split && (
                      <OverviewColumn
                        thread={thread}
                        usage={usage}
                        synced={synced}
                        owned={owned}
                        onCompact={
                          supportsCompaction
                            ? {
                                run: () => void compact(),
                                busy: compacting,
                                disabled: !canCompact,
                              }
                            : undefined
                        }
                      />
                    )
                  }
                />
                <div
                  ref={composer}
                  className={cn(
                    "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background from-60% to-transparent pt-8 pr-3",
                    overview.open && !split && "@4xl:pr-75",
                  )}
                >
                  <div className="pointer-events-auto mx-auto w-full max-w-4xl px-4 pb-6">
                    {owned && (
                      <ShipBar
                        thread={thread}
                        unshipped={unshipped}
                        showShip={showShip}
                        send={send}
                        panels={panels}
                        split={split}
                        suggestions={question ? null : chips}
                      />
                    )}
                    {!owned && <SharedNotice thread={thread} driven={driven} />}
                    {(owned || driven) &&
                      (question ? (
                        <AnswerForm
                          key={question.id}
                          tool={question}
                          threadId={thread.id}
                          onSubmit={answer}
                        />
                      ) : (
                        <>
                          {!owned && <div className="flex pb-2">{chips}</div>}
                          <PromptInput
                            threadId={thread.id}
                            running={running}
                            filesWhileRunning={thread.agentBackend === "claude"}
                            onStop={cancel}
                            onCompact={compact}
                            claude={
                              thread.agentBackend === "claude"
                                ? { choice: claudeChoice, onChange: setClaudeChoice, only: true }
                                : undefined
                            }
                            placeholder="Reply to the agent…"
                            onSubmit={send}
                            tools={<ProjectInfo projectId={thread.projectId} />}
                          />
                        </>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          </ResizablePanel>
          {sideOpen && (
            <>
              <ResizableHandle className={GAP_HANDLE} />
              <ResizablePanel id="side" defaultSize="50" minSize="25">
                <ThreadSidePanels
                  threadId={thread.id}
                  runtimeId={thread.runtimeId}
                  running={running}
                  panels={panels}
                  owned={owned}
                  handleClassName={GAP_HANDLE}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
