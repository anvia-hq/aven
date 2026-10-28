import { createFileRoute, Link } from "@tanstack/react-router";

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
      <ThreadHeader thread={thread} running={running} onCancel={cancel} />
      <ThreadMessages messages={messages} error={error} />
      <div className="mx-auto w-full max-w-3xl px-6 pb-6">
        <PromptInput
          disabled={running}
          placeholder={running ? "Agent is working…" : "Reply to the agent…"}
          onSubmit={(prompt) => void send(prompt)}
        />
      </div>
    </div>
  );
}
