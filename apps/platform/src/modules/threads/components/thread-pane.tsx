import { useDefaultLayout } from "react-resizable-panels";

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
import { ThreadHeader } from "@/modules/threads/components/thread-header";
import { ThreadMessages } from "@/modules/threads/components/thread-messages";
import { ThreadSidePanels } from "@/modules/threads/components/thread-side-panels";
import { useCompactThread } from "@/modules/threads/hooks/use-compact-thread";
import { useElementHeight } from "@/modules/threads/hooks/use-element-height";
import { useFirstPrompt } from "@/modules/threads/hooks/use-first-prompt";
import { useThread } from "@/modules/threads/hooks/use-thread";
import { useThreadPanels } from "@/modules/threads/hooks/use-thread-panels";

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
  const { compacting, compact } = useCompactThread(threadId);
  const canCompact = owned && !running && !question;
  const wide = useMediaQuery("(min-width: 1024px)");
  const panels = useThreadPanels(threadId);
  const { overview, diff, files, terminal } = panels;
  const sideOpen = !split && (diff.open || files.open || (owned && terminal.open));
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

  return (
    <div className="flex h-[calc(100svh-var(--mobile-chrome))] min-w-0 flex-col md:h-[calc(100svh-0.5rem)]">
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
                        onCompact={{
                          run: () => void compact(),
                          busy: compacting,
                          disabled: !canCompact,
                        }}
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
                        <PromptInput
                          threadId={thread.id}
                          running={running}
                          onStop={cancel}
                          onCompact={compact}
                          placeholder="Reply to the agent…"
                          onSubmit={send}
                          tools={<ProjectInfo projectId={thread.projectId} />}
                        />
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
