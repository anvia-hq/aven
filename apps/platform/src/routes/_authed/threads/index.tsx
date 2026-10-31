import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { ImportRepositoryDialog } from "@/modules/projects/components/import-repository-dialog";
import { ProjectPicker } from "@/modules/projects/components/project-picker";
import { useProjects } from "@/modules/projects/hooks/use-projects";
import { PromptInput } from "@/modules/threads/components/prompt-input";
import { ThreadList } from "@/modules/threads/components/thread-list";
import { useStartThread } from "@/modules/threads/hooks/use-start-thread";
import { useThreads } from "@/modules/threads/hooks/use-threads";
import type { OutgoingMessage, RunSelection } from "@/modules/threads/types";

export const Route = createFileRoute("/_authed/threads/")({
  component: NewThread,
});

function NewThread() {
  const startThread = useStartThread();
  const { projects, loaded } = useProjects();
  const recent = useThreads().threads.slice(0, 3);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);

  const start = (message: OutgoingMessage, selection: RunSelection) =>
    startThread(projectId, message, selection);

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col justify-center gap-5 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">What should we build?</h1>
        <p className="text-sm text-muted-foreground">
          Start a thread inside a project. The agent reads, edits and runs code there.
        </p>
      </div>

      {/* Nothing until projects load: swapping the picker for the empty state would remount, and so close, an open dialog. */}
      {loaded &&
        (projects.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">Import a repository to get started.</p>
            <ImportRepositoryDialog onImported={(project) => setProjectId(project.id)} />
          </div>
        ) : (
          <>
            <ProjectPicker value={projectId} onChange={setProjectId} />

            <PromptInput autoFocus onSubmit={start} />
          </>
        ))}

      <section aria-label="Recent threads" className="flex flex-col gap-2">
        <h2 className="text-sm text-muted-foreground">Recent</h2>
        <ThreadList threads={recent} empty="No threads yet." />
      </section>
    </main>
  );
}
