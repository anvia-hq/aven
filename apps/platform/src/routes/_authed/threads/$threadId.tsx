import { createFileRoute, Link } from "@tanstack/react-router";
import { useDefaultLayout } from "react-resizable-panels";

import { cn } from "cn";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/resizable";
import { safeStorage, useLocalStorage } from "@/hooks/use-local-storage";
import { useMediaQuery } from "@/hooks/use-media-query";
import { DesktopPanel } from "@/modules/desktop/components/desktop-panel";
import { OverviewColumn } from "@/modules/overview/components/overview-column";
import { PromptInput } from "@/modules/threads/components/prompt-input";
import { QuestionForm } from "@/modules/threads/components/question-form";
import { ThreadHeader } from "@/modules/threads/components/thread-header";
import { ThreadMessages } from "@/modules/threads/components/thread-messages";
import { useThread } from "@/modules/threads/hooks/use-thread";

export const Route = createFileRoute("/_authed/threads/$threadId")({
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  const { thread, loaded, messages, running, usage, error, question, send, answer, cancel } =
    useThread(threadId);
  // Side by side needs room; on a narrow screen the desktop stacks under the conversation.
  const wide = useMediaQuery("(min-width: 1024px)");
  // What is open is remembered. The overview is on until closed; the desktop opens when asked for.
  const [overviewOpen, setOverviewOpen] = useLocalStorage("aven.overview-open", true);
  const [desktopOpen, setDesktopOpen] = useLocalStorage("aven.desktop-open", false);
  // Each orientation and each set of panels keeps its own sizes.
  const layout = useDefaultLayout({
    id: `aven.thread-panels.${wide ? "row" : "column"}`,
    panelIds: desktopOpen ? ["conversation", "desktop"] : ["conversation"],
    storage: safeStorage,
  });

  if (!loaded) return null;

  if (!thread) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-2">
        <h1 className="text-xl font-semibold">Thread not found</h1>
        <Link to="/threads" className="text-sm text-muted-foreground underline">
          Back to threads
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100svh-2.5rem)] min-w-0 flex-col md:h-svh">
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
              <ThreadHeader
                thread={thread}
                running={running}
                onCancel={cancel}
                overviewOpen={overviewOpen}
                onToggleOverview={() => setOverviewOpen(!overviewOpen)}
                desktopOpen={desktopOpen}
                onToggleDesktop={() => setDesktopOpen(!desktopOpen)}
              />
              {/* The conversation scrolls the full height of the panel, behind the composer. */}
              <div className="relative min-h-0 flex-1">
                <ThreadMessages
                  messages={messages}
                  error={error}
                  aside={overviewOpen && <OverviewColumn thread={thread} usage={usage} />}
                />
                <div
                  className={cn(
                    "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background from-60% to-transparent pt-8 pr-3",
                    // Keep the composer under the messages, not under the overview.
                    overviewOpen && "@4xl:pr-75",
                  )}
                >
                  <div className="pointer-events-auto mx-auto w-full max-w-4xl px-4 pb-3">
                    {question ? (
                      <QuestionForm key={question.id} tool={question} onSubmit={answer} />
                    ) : (
                      <PromptInput
                        disabled={running}
                        placeholder={running ? "Agent is working…" : "Reply to the agent…"}
                        onSubmit={send}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </ResizablePanel>
          {desktopOpen && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel id="desktop" defaultSize="50" minSize="25">
                <DesktopPanel threadId={thread.id} onClose={() => setDesktopOpen(false)} />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
