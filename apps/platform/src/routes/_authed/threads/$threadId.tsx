import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

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
  const [desktopOpen, setDesktopOpen] = useState(
    () => window.matchMedia("(min-width: 1024px)").matches,
  );

  if (!loaded) return null;

  if (!thread) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-2">
        <h1 className="text-xl font-semibold">Thread not found</h1>
        <Link to="/threads" className="text-sm text-muted-foreground underline">
          Back to threads
        </Link>
      </main>
    );
  }

  return (
    <div className="flex h-svh flex-col">
      <ThreadHeader
        thread={thread}
        running={running}
        onCancel={cancel}
        desktopOpen={desktopOpen}
        onToggleDesktop={() => setDesktopOpen((open) => !open)}
      />
      <div className="min-h-0 flex-1">
        {/* The conversation stays the first panel whether or not the desktop is open, so opening
            it does not remount the conversation and lose a half-written reply. */}
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel id="conversation" defaultSize="50" minSize="30">
            <div className="flex h-full flex-col">
              <ThreadMessages messages={messages} error={error} />
              <div className="mx-auto w-full max-w-3xl px-6 pb-6">
                <PromptInput
                  disabled={running}
                  placeholder={running ? "Agent is working…" : "Reply to the agent…"}
                  onSubmit={send}
                />
              </div>
            </div>
          </ResizablePanel>
          {desktopOpen && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel id="desktop" defaultSize="50" minSize="25">
                <DesktopPanel threadId={thread.id} />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
