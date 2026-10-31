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
    <div className="flex min-h-svh flex-col">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b px-4">
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">New thread</h1>
        {/* Only once there are projects: before, the empty state below has the button. */}
        {loaded && projects.length > 0 && (
          <ImportRepositoryDialog size="sm" onImported={(project) => setProjectId(project.id)} />
        )}
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 p-4">
        <div className="flex flex-col gap-1.5 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">What should we build?</h2>
          <p className="text-sm text-muted-foreground">
            Start a thread inside a project. The agent reads, edits and runs code there.
          </p>
        </div>

        {/* Nothing until projects load: swapping the composer for the empty state would remount, and so close, an open dialog. */}
        {loaded &&
          (projects.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">Import a repository to get started.</p>
              <ImportRepositoryDialog onImported={(project) => setProjectId(project.id)} />
            </div>
          ) : (
            <PromptInput
              autoFocus
              onSubmit={start}
              tools={<ProjectPicker value={projectId} onChange={setProjectId} />}
            />
          ))}

        <section aria-label="Recent threads" className="flex flex-col gap-1">
          <h3 className="px-3 text-xs font-medium text-muted-foreground">Recent</h3>
          <ThreadList threads={recent} empty="No threads yet." />
        </section>
      </main>
    </div>
  );
}
