import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { useMediaQuery } from "@/hooks/use-media-query";
import { NativeSelect, NativeSelectOption } from "@/components/native-select";
import { useCodexLogin } from "@/modules/codex-setup/hooks/use-codex-login";
import { AddFolderDialog } from "@/modules/projects/components/add-folder-dialog";
import { ProjectPicker } from "@/modules/projects/components/project-picker";
import { useProjects } from "@/modules/projects/hooks/use-projects";
import { PromptInput } from "@/modules/threads/components/prompt-input";
import { ThreadList } from "@/modules/threads/components/thread-list";
import { useStartThread } from "@/modules/threads/hooks/use-start-thread";
import { useThreads } from "@/modules/threads/hooks/use-threads";
import type { OutgoingMessage, RunSelection, Thread } from "@/modules/threads/types";

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
  const wide = useMediaQuery("(min-width: 768px)");
  const open = threads.filter((thread) => thread.state === "open");
  const openShared = shared.filter((thread) => thread.state === "open");
  const recent = wide ? open.slice(0, 3) : open;
  const sharedRecent = wide ? openShared.slice(0, 3) : openShared;
  const asked = Route.useSearch().project;
  const [chosen, setProjectId] = useState<string | undefined>(undefined);
  const [backend, setBackend] = useState<Thread["agentBackend"]>("native");
  const codex = useCodexLogin();
  const projectId = chosen ?? projects.find((project) => project.id === asked)?.id;
  const needsLogin = backend === "codex" && codex.loaded && !codex.login?.configured;

  const start = (message: OutgoingMessage, selection: RunSelection) => {
    if (needsLogin) return false;

    return startThread(projectId, message, selection, backend);
  };

  return (
    <div className="flex min-h-[calc(100svh-var(--mobile-chrome))] flex-col md:min-h-[calc(100svh-1rem-2px)]">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b px-4">
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">New thread</h1>
        {loaded && projects.length > 0 && (
          <AddFolderDialog size="sm" onAdded={(project) => setProjectId(project.id)} />
        )}
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 p-4">
        <div className="flex flex-col gap-1.5 text-center">
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
            What should we build?
          </h2>
          <p className="hidden text-sm text-muted-foreground md:block">
            Start a thread inside a project. The agent reads, edits and runs code there.
          </p>
        </div>

        {loaded &&
          (projects.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">Add a folder to get started.</p>
              <AddFolderDialog onAdded={(project) => setProjectId(project.id)} />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-center gap-2">
                <NativeSelect
                  aria-label="Agent"
                  size="sm"
                  value={backend}
                  onChange={(event) => setBackend(event.target.value as Thread["agentBackend"])}
                >
                  <NativeSelectOption value="native">Aven</NativeSelectOption>
                  <NativeSelectOption value="codex">Codex</NativeSelectOption>
                </NativeSelect>
                {needsLogin && (
                  <Link to="/settings/codex" className="text-xs text-muted-foreground underline">
                    Set a ChatGPT login in Settings before this thread can run on Codex
                  </Link>
                )}
              </div>
              <PromptInput
                autoFocus
                backend={backend}
                onSubmit={start}
                tools={<ProjectPicker value={projectId} onChange={setProjectId} />}
              />
            </div>
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
