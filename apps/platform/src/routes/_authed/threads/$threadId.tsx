import { createFileRoute } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";
import { useDefaultLayout } from "react-resizable-panels";

import { cn } from "cn";

import { NotFound } from "@/components/not-found";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/resizable";
import { safeStorage } from "@/hooks/use-local-storage";
import { useMediaQuery } from "@/hooks/use-media-query";
import { DesktopPanel } from "@/modules/desktop/components/desktop-panel";
import { FilesPanel } from "@/modules/files/components/files-panel";
import { ChangesBadge } from "@/modules/diff/components/changes-badge";
import { DiffPanel } from "@/modules/diff/components/diff-panel";
import { useThreadDiff } from "@/modules/diff/hooks/use-thread-diff";
import { TerminalPanel } from "@/modules/terminal/components/terminal-panel";
import { OverviewColumn } from "@/modules/overview/components/overview-column";
import { PromptInput } from "@/modules/threads/components/prompt-input";
import { AnswerForm } from "@/modules/threads/components/answer-form";
import { ShipButton } from "@/modules/threads/components/ship-button";
import { ThreadHeader } from "@/modules/threads/components/thread-header";
import { ThreadMessages } from "@/modules/threads/components/thread-messages";
import { useThread } from "@/modules/threads/hooks/use-thread";
import { useThreadPanels } from "@/modules/threads/hooks/use-thread-panels";

export const Route = createFileRoute("/_authed/threads/$threadId")({
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  const { thread, loaded, messages, running, usage, error, question, send, answer, cancel } =
    useThread(threadId);
  // Side by side needs room; on a narrow screen the desktop stacks under the conversation.
  const wide = useMediaQuery("(min-width: 1024px)");
  const panels = useThreadPanels();
  const { overview, desktop, diff, files, terminal } = panels;
  // Files, Changes, Desktop and Terminal share one column, so the conversation keeps the same width whichever is open.
  const sideOpen = diff.open || desktop.open || files.open || terminal.open;
  const panelIds = sideOpen ? ["conversation", "side"] : ["conversation"];
  const side = useDefaultLayout({
    id: "aven.thread-side",
    panelIds: ["files", "diff", "desktop", "terminal"],
    storage: safeStorage,
  });
  // What the pull request does not have yet (everything, before there is one): the badge shows it,
  // and Update PR has nothing to send without it.
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

  const sidePanels: { id: string; node: ReactNode }[] = [];
  if (files.open) {
    sidePanels.push({
      id: "files",
      node: (
        <FilesPanel key={thread.id} threadId={thread.id} running={running} onClose={files.close} />
      ),
    });
  }
  if (diff.open) {
    sidePanels.push({
      id: "diff",
      node: <DiffPanel threadId={thread.id} running={running} onClose={diff.close} />,
    });
  }
  if (desktop.open) {
    sidePanels.push({
      id: "desktop",
      node: <DesktopPanel threadId={thread.id} onClose={desktop.close} />,
    });
  }

  if (terminal.open) {
    sidePanels.push({
      id: "terminal",
      node: <TerminalPanel threadId={thread.id} onClose={terminal.close} />,
    });
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
            <div className="@container flex h-full min-w-0 flex-col">
              <ThreadHeader thread={thread} panels={panels} />
              {/* The conversation scrolls the full height of the panel, behind the composer. */}
              <div className="relative min-h-0 flex-1">
                <ThreadMessages
                  threadId={thread.id}
                  messages={messages}
                  running={running}
                  error={error}
                  aside={overview.open && <OverviewColumn thread={thread} usage={usage} />}
                />
                <div
                  className={cn(
                    "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background from-60% to-transparent pt-8 pr-3",
                    // Keep the composer under the messages, not under the overview.
                    overview.open && "@4xl:pr-75",
                  )}
                >
                  <div className="pointer-events-auto mx-auto w-full max-w-4xl px-4 pb-6">
                    <div className="flex items-center justify-end gap-2 pb-2">
                      <ChangesBadge
                        empty={unshipped.files.length === 0}
                        additions={unshipped.additions}
                        deletions={unshipped.deletions}
                      />
                      <ShipButton
                        thread={thread}
                        upToDate={
                          unshipped.loaded && !unshipped.problem && unshipped.files.length === 0
                        }
                      />
                    </div>
                    {question ? (
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
                        placeholder="Reply to the agent…"
                        onSubmit={send}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </ResizablePanel>
          {sideOpen && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel id="side" defaultSize="50" minSize="25">
                <ResizablePanelGroup
                  orientation="vertical"
                  defaultLayout={side.defaultLayout}
                  onLayoutChanged={side.onLayoutChanged}
                >
                  {sidePanels.map((panel, index) => (
                    <Fragment key={panel.id}>
                      {index > 0 && <ResizableHandle withHandle />}
                      <ResizablePanel id={panel.id} defaultSize="50" minSize="15">
                        {panel.node}
                      </ResizablePanel>
                    </Fragment>
                  ))}
                </ResizablePanelGroup>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
