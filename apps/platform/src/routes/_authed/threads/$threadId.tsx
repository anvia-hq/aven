import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { useMediaQuery } from "@/hooks/use-media-query";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/resizable";
import { DesktopPanel } from "@/modules/desktop/components/desktop-panel";

import { PromptInput } from "@/modules/threads/components/prompt-input";
import { ThreadHeader } from "@/modules/threads/components/thread-header";
import { ThreadMessages } from "@/modules/threads/components/thread-messages";
import { useThread } from "@/modules/threads/hooks/use-thread";

export const Route = createFileRoute("/_authed/threads/$threadId")({
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  const { thread, loaded, messages, running, error, send, cancel } = useThread(threadId);
  // Side by side needs room; on a narrow screen the desktop opens when asked for.
  const wide = useMediaQuery("(min-width: 1024px)");
  const [desktopOpen, setDesktopOpen] = useState(wide);

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
        <ResizablePanelGroup orientation={wide ? "horizontal" : "vertical"}>
          <ResizablePanel id="conversation" defaultSize="50" minSize="30">
            <div className="flex h-full min-w-0 flex-col">
              <ThreadHeader
                thread={thread}
                running={running}
                onCancel={cancel}
                desktopOpen={desktopOpen}
                onToggleDesktop={() => setDesktopOpen((open) => !open)}
              />
              {/* The conversation scrolls the full height of the panel, behind the composer. */}
              <div className="relative min-h-0 flex-1">
                <ThreadMessages messages={messages} error={error} />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background from-60% to-transparent pt-8 pr-3">
                  <div className="pointer-events-auto mx-auto w-full max-w-2xl px-4 pb-3">
                    <PromptInput
                      disabled={running}
                      placeholder={running ? "Agent is working…" : "Reply to the agent…"}
                      onSubmit={send}
                    />
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
