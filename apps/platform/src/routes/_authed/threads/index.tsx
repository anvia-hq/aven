import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/button";
import { PromptInput } from "@/modules/threads/components/prompt-input";
import { ThreadList } from "@/modules/threads/components/thread-list";
import { useStartThread } from "@/modules/threads/hooks/use-start-thread";
import { useThreads } from "@/modules/threads/hooks/use-threads";
import { SUGGESTIONS } from "@/modules/threads/types";

export const Route = createFileRoute("/_authed/threads/")({
  component: NewThread,
});

function NewThread() {
  const start = useStartThread();
  const recent = useThreads().slice(0, 3);

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col justify-center gap-8 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">What should we build?</h1>
        <p className="text-muted-foreground">
          Start a thread. The agent reads, edits and runs code in your repo.
        </p>
      </div>

      <PromptInput autoFocus onSubmit={start} />

      <div className="flex flex-wrap gap-2" aria-label="Suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <Button
            key={suggestion}
            variant="outline"
            size="sm"
            className="font-normal"
            onClick={() => start(suggestion, "smart")}
          >
            {suggestion}
          </Button>
        ))}
      </div>

      <section aria-label="Recent threads" className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Recent</h2>
        <ThreadList threads={recent} />
      </section>
    </main>
  );
}
