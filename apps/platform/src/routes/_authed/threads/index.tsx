import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/button";
import { toast } from "@/components/toast";
import { PromptInput } from "@/modules/threads/components/prompt-input";
import { ProjectPathField } from "@/modules/threads/components/project-path-field";
import { ThreadList } from "@/modules/threads/components/thread-list";
import { useStartThread } from "@/modules/threads/hooks/use-start-thread";
import { useThreads } from "@/modules/threads/hooks/use-threads";
import { SUGGESTIONS } from "@/modules/threads/types";

export const Route = createFileRoute("/_authed/threads/")({
  component: NewThread,
});

function NewThread() {
  const startThread = useStartThread();
  const recent = useThreads().threads.slice(0, 3);
  const [projectPath, setProjectPath] = useState("");

  function start(prompt: string) {
    if (!projectPath.trim()) {
      toast.add({ title: "Choose a project path first", type: "error" });
      return;
    }
    void startThread(projectPath.trim(), prompt);
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col justify-center gap-10 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold tracking-tight">What should we build?</h1>
        <p className="text-base text-muted-foreground">
          Start a thread. The agent reads, edits and runs code in the project you choose.
        </p>
      </div>

      <ProjectPathField value={projectPath} onChange={setProjectPath} />

      <PromptInput autoFocus onSubmit={start} />

      <div className="flex flex-wrap gap-2" aria-label="Suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <Button
            key={suggestion}
            variant="outline"
            size="sm"
            className="rounded-full font-normal text-muted-foreground"
            onClick={() => start(suggestion)}
          >
            {suggestion}
          </Button>
        ))}
      </div>

      <section aria-label="Recent threads" className="flex flex-col gap-3">
        <h2 className="text-sm text-muted-foreground">Recent</h2>
        <ThreadList threads={recent} empty="No threads yet." />
      </section>
    </main>
  );
}
