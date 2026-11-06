import { createFileRoute } from "@tanstack/react-router";
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
import { useFirstPrompt } from "@/modules/threads/hooks/use-first-prompt";
import { useThread } from "@/modules/threads/hooks/use-thread";
import { useThreadPanels } from "@/modules/threads/hooks/use-thread-panels";

export const Route = createFileRoute("/_authed/_shell/threads/$threadId")({
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  const {
    thread,
    owned,
    loaded,
    messages,
    pending,
    steers,
    running,
    startedAt,
    usage,
    synced,
    error,
    question,
    send,
    answer,
    cancel,
  } = useThread(threadId);
  useFirstPrompt(threadId, send);
  const { compacting, compact } = useCompactThread(threadId);
  // Compacting is a run of its own: not while the agent works or waits on its question.
  const canCompact = owned && !running && !question;
  // Side by side needs room; on a narrow screen the desktop stacks under the conversation.
  const wide = useMediaQuery("(min-width: 1024px)");
  const panels = useThreadPanels();
  const { overview, desktop, diff, files, terminal } = panels;
  // Files, Changes, Desktop and Terminal share one column, so the conversation keeps the same width whichever is open.
  // The Desktop and the Terminal are the thread's creator's alone (decision 0084).
  const sideOpen = diff.open || files.open || (owned && (desktop.open || terminal.open));
  const panelIds = sideOpen ? ["conversation", "side"] : ["conversation"];
  // What the pull request does not have yet (everything, before there is one): the badge shows it,
  // and Update PR has nothing to send without it. Asked for here, before the thread has loaded.
  const unshipped = useThreadDiff(threadId, "unshipped", running);
  // Each orientation and each set of panels keeps its own sizes.
  const layout = useDefaultLayout({
    id: `aven.thread-panels.${wide ? "row" : "column"}`,
    panelIds,
    storage: safeStorage,
  });

  if (!loaded) return null;

  if (!thread) {
    return <NotFound title="Thread not found" to="/threads" back="Back to threads" />;
  }

  return (
    <div className="flex h-[calc(100svh-2.5rem)] min-w-0 flex-col md:h-[calc(100svh-1rem)]">
      <div className="min-h-0 flex-1">
        {/* The conversation stays the first panel whether or not the desktop is open, so opening
            it does not remount the conversation and lose a half-written reply. */}
        <ResizablePanelGroup
          orientation={wide ? "horizontal" : "vertical"}
          defaultLayout={layout.defaultLayout}
          onLayoutChanged={layout.onLayoutChanged}
        >
          <ResizablePanel id="conversation" defaultSize="50" minSize="30">
            <div className="@container flex h-full min-w-0 flex-col overflow-clip bg-background md:rounded-r-xl md:border-y md:border-r md:border-sidebar-border">
              <ThreadHeader thread={thread} panels={panels} owned={owned} />
              {/* The conversation scrolls the full height of the panel, behind the composer. */}
              <div className="relative min-h-0 flex-1">
                <ThreadMessages
                  threadId={thread.id}
                  messages={messages}
                  pending={pending}
                  steers={steers}
                  running={running}
                  startedAt={startedAt}
                  error={error}
                  aside={
                    overview.open && (
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
                  className={cn(
                    "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background from-60% to-transparent pt-8 pr-3",
                    // Keep the composer under the messages, not under the overview.
                    overview.open && "@4xl:pr-75",
                  )}
                >
                  <div className="pointer-events-auto mx-auto w-full max-w-4xl px-4 pb-6">
                    {owned && <ShipBar thread={thread} unshipped={unshipped} />}
                    {!owned && <SharedNotice thread={thread} />}
                    {owned &&
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
                          // The same while the agent works: the composer's editor is made again
                          // when its placeholder changes, which broke a message sent as a run began.
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
