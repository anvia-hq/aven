import { backendSupports } from "@aven/protocol/runtime-wire";
import { PANEL_EXIT_MS } from "@aven/ui/panel-enter";
import {
  GAP_HANDLE,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useDefaultLayout,
} from "@aven/ui/resizable";
import { useHeldValue } from "@aven/ui/use-held";
import { safeStorage } from "@aven/ui/use-local-storage";
import { useMediaQuery } from "@aven/ui/use-media-query";
import { cn } from "cn";

import { NotFound } from "@/components/not-found";
import { useThreadDiff } from "@/modules/diff/hooks/use-thread-diff";
import { OverviewColumn } from "@/modules/overview/components/overview-column";
import { usePreviewOffer } from "@/modules/preview/hooks/use-preview-offer";
import { ProjectInfo } from "@/modules/projects/components/project-info";

import { useCompactThread } from "../hooks/use-compact-thread";
import { useElementHeight } from "../hooks/use-element-height";
import { useFirstPrompt } from "../hooks/use-first-prompt";
import { useFollowUps } from "../hooks/use-follow-ups";
import { useModelSelection } from "../hooks/use-model-selection";
import { usePullRequestChecks } from "../hooks/use-pull-request-checks";
import { useThread } from "../hooks/use-thread";
import { useThreadPanels } from "../hooks/use-thread-panels";
import { AnswerForm } from "./answer-form";
import { FollowUpChips } from "./follow-up-chips";
import { PromptInput } from "./prompt-input";
import { SharedNotice } from "./shared-notice";
import { ShipBar } from "./ship-bar";
import { ThreadHeader } from "./thread-header";
import { ThreadMessages } from "./thread-messages";
import { ThreadSidePanels } from "./thread-side-panels";

type Props = { threadId: string; split?: boolean; onClose?: () => void };

export function ThreadPane({ threadId, split, onClose }: Props) {
  const {
    thread,
    owned,
    viewer,
    driven,
    loaded,
    messages,
    handoffs,
    narrations,
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
    decline,
  } = useThread(threadId);
  useFirstPrompt(threadId, send);
  const followUps = useFollowUps(threadId, loaded && synced, running, messages, viewer);
  const { selection } = useModelSelection(threadId, thread?.agentBackend);
  const { compacting, compact } = useCompactThread(threadId, thread?.agentBackend);
  const supportsCompaction = backendSupports(thread?.agentBackend, "compaction");
  const canCompact = owned && !running && !question && supportsCompaction;
  const wide = useMediaQuery("(min-width: 1024px)");
  const panels = useThreadPanels(threadId);
  const { overview, diff, files, terminal, preview } = panels;
  const previewOffer = usePreviewOffer(threadId, preview.show);
  const sideWanted =
    !split && (diff.open || files.open || (owned && (terminal.open || preview.open)));
  const sideOpen = useHeldValue(sideWanted || null, PANEL_EXIT_MS).shown !== null;
  const panelIds = sideOpen ? ["conversation", "side"] : ["conversation"];
  const unshipped = useThreadDiff(threadId, "unshipped", running, true, { summaryOnly: true });
  const prChecks = usePullRequestChecks(threadId, thread?.pullRequests ?? [], running);
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

  const runSelection = selection;

  const chips = (
    <FollowUpChips
      suggestions={followUps.suggestions}
      onPick={(prompt) => {
        followUps.clear();
        void send({ prompt, attachments: [], mentions: [] }, runSelection);
      }}
    />
  );

  return (
    <div className="flex h-[calc(100svh-var(--mobile-chrome))] min-w-0 flex-col md:h-svh">
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup
          orientation={wide ? "horizontal" : "vertical"}
          defaultLayout={layout.defaultLayout}
          onLayoutChanged={layout.onLayoutChanged}
        >
          <ResizablePanel id="conversation" defaultSize="50" minSize="30">
            <div
              className={cn(
                "@container flex h-full min-w-0 flex-col overflow-clip bg-background md:border md:border-foreground/12",
              )}
            >
              <ThreadHeader
                thread={thread}
                panels={panels}
                owned={owned}
                driven={driven}
                onClose={onClose}
              />
              <div ref={conversation} className="relative min-h-0 flex-1">
                <ThreadMessages
                  threadId={thread.id}
                  runtimeId={thread.runtimeId}
                  projectId={thread.projectId}
                  markColor={thread.markColor}
                  messages={messages}
                  handoffs={handoffs}
                  narrations={narrations}
                  prChecks={prChecks}
                  onOpenChanges={split ? undefined : diff.show}
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
                  <div className="pointer-events-auto mx-auto w-full max-w-3xl px-4 pb-6">
                    {owned && (
                      <ShipBar
                        thread={thread}
                        unshipped={unshipped}
                        showShip={showShip}
                        send={send}
                        selection={runSelection}
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
                          backend={thread.agentBackend}
                          onSubmit={answer}
                          onDecline={decline}
                        />
                      ) : (
                        <>
                          {!owned && <div className="flex pb-2">{chips}</div>}
                          <PromptInput
                            threadId={thread.id}
                            running={running}
                            backend={thread.agentBackend}
                            onStop={cancel}
                            onCompact={compact}
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
                  previewOffer={previewOffer}
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
