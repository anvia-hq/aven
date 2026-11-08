import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { useMediaQuery } from "@/hooks/use-media-query";
import { ImportRepositoryDialog } from "@/modules/projects/components/import-repository-dialog";
import { ProjectPicker } from "@/modules/projects/components/project-picker";
import { useProjects } from "@/modules/projects/hooks/use-projects";
import { PromptInput } from "@/modules/threads/components/prompt-input";
import { ThreadList } from "@/modules/threads/components/thread-list";
import { useStartThread } from "@/modules/threads/hooks/use-start-thread";
import { useThreads } from "@/modules/threads/hooks/use-threads";
import type { OutgoingMessage, RunSelection } from "@/modules/threads/types";

export const Route = createFileRoute("/_authed/_shell/threads/")({
  validateSearch: (search: Record<string, unknown>): { project?: string } => ({
    project:
      typeof search.project === "string" && search.project !== "" ? search.project : undefined,
  }),
  component: NewThread,
});

function NewThread() {
  const startThread = useStartThread();
  const { projects, loaded } = useProjects();
  const { threads, shared } = useThreads();
  // On a phone this page is what the Threads tab opens, so it lists every thread you have; on a
  // wider screen the sidebar holds them all and this is the few most recent.
  const wide = useMediaQuery("(min-width: 768px)");
  const open = threads.filter((thread) => thread.state === "open");
  const openShared = shared.filter((thread) => thread.state === "open");
  const recent = wide ? open.slice(0, 3) : open;
  const sharedRecent = wide ? openShared.slice(0, 3) : openShared;
  const asked = Route.useSearch().project;
  const [chosen, setProjectId] = useState<string | undefined>(undefined);
  const projectId = chosen ?? projects.find((project) => project.id === asked)?.id;

  const start = (message: OutgoingMessage, selection: RunSelection) =>
    startThread(projectId, message, selection);

  return (
    <div className="flex min-h-[calc(100svh-var(--mobile-chrome))] flex-col md:min-h-[calc(100svh-1rem-2px)]">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b px-4">
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">New thread</h1>
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
        {sharedRecent.length > 0 && (
          <section aria-label="Shared with workspace" className="flex flex-col gap-1">
            <h3 className="px-3 text-xs font-medium text-muted-foreground">
              Shared with workspace
            </h3>
            <ThreadList threads={sharedRecent} />
          </section>
        )}
      </main>
    </div>
  );
}
