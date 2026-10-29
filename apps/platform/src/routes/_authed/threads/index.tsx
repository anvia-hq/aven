import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/button";
import { toast } from "@/components/toast";
import { NewProjectDialog } from "@/modules/projects/components/new-project-dialog";
import { ProjectPicker } from "@/modules/projects/components/project-picker";
import { useProjects } from "@/modules/projects/hooks/use-projects";
import { PromptInput } from "@/modules/threads/components/prompt-input";
import { ThreadList } from "@/modules/threads/components/thread-list";
import { useModelSelection } from "@/modules/threads/hooks/use-model-selection";
import { useStartThread } from "@/modules/threads/hooks/use-start-thread";
import { useThreads } from "@/modules/threads/hooks/use-threads";
import { SUGGESTIONS, type RunSelection } from "@/modules/threads/types";

export const Route = createFileRoute("/_authed/threads/")({
  component: NewThread,
});

function NewThread() {
  const startThread = useStartThread();
  const { selection } = useModelSelection();
  const { projects, loaded } = useProjects();
  const recent = useThreads().threads.slice(0, 3);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);

  async function start(prompt: string, selection: RunSelection) {
    if (!projectId) {
      toast.add({ title: "Choose a project first", type: "error" });
      return false;
    }
    return startThread(projectId, prompt, selection);
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col justify-center gap-10 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold tracking-tight">What should we build?</h1>
        <p className="text-base text-muted-foreground">
          Start a thread inside a project. The agent reads, edits and runs code there.
        </p>
      </div>

      {/* Nothing until projects load: swapping the picker for the empty state would remount, and so close, an open dialog. */}
      {loaded &&
        (projects.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-10 text-center">
            <p className="text-sm text-muted-foreground">Create a project to get started.</p>
            <NewProjectDialog onCreated={(project) => setProjectId(project.id)} />
          </div>
        ) : (
          <>
            <ProjectPicker value={projectId} onChange={setProjectId} />

            <PromptInput autoFocus onSubmit={start} />

            <div className="flex flex-wrap gap-2" aria-label="Suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  className="rounded-full font-normal text-muted-foreground"
                  onClick={() => void start(suggestion, selection)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </>
        ))}

      <section aria-label="Recent threads" className="flex flex-col gap-3">
        <h2 className="text-sm text-muted-foreground">Recent</h2>
        <ThreadList threads={recent} empty="No threads yet." />
      </section>
    </main>
  );
}
