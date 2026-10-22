import { createFileRoute, Link } from "@tanstack/react-router";

import { PromptInput } from "@/modules/threads/components/prompt-input";
import { ThreadHeader } from "@/modules/threads/components/thread-header";
import { ThreadMessages } from "@/modules/threads/components/thread-messages";
import { useAgent } from "@/modules/threads/hooks/use-agent";
import { useThread } from "@/modules/threads/hooks/use-thread";

export const Route = createFileRoute("/_authed/threads/$threadId")({
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  const thread = useThread(threadId);
  const { send } = useAgent();

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

  const running = thread.status === "running";

  return (
    <div className="flex h-svh flex-col">
      <ThreadHeader thread={thread} />
      <ThreadMessages messages={thread.messages} />
      <div className="mx-auto w-full max-w-3xl px-6 pb-6">
        <PromptInput
          defaultMode={thread.mode}
          disabled={running}
          placeholder={running ? "Agent is working…" : "Reply to the agent…"}
          onSubmit={(prompt) => void send({ threadId: thread.id, prompt })}
        />
      </div>
    </div>
  );
}
