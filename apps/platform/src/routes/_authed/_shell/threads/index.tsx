import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";

import { useMediaQuery } from "@/hooks/use-media-query";
import { ProjectMenu } from "@/modules/projects/components/project-menu";
import { projectFits } from "@/modules/projects/project-fits";
import { recentProjects } from "@/modules/projects/recent-projects";
import { useProjects } from "@/modules/projects/hooks/use-projects";
import { RuntimePicker } from "@/modules/runtimes/components/runtime-picker";
import { PromptInput } from "@/modules/threads/components/prompt-input";
import { ThreadList } from "@/modules/threads/components/thread-list";
import { useNewThreadComputer } from "@/modules/threads/hooks/use-new-thread-computer";
import { useStartThread } from "@/modules/threads/hooks/use-start-thread";
import { useThreads } from "@/modules/threads/hooks/use-threads";
import type { OutgoingMessage, RunSelection } from "@/modules/threads/types";

const GlassMark = lazy(() =>
  import("@/modules/threads/components/glass-mark").then((module) => ({
    default: module.GlassMark,
  })),
);

export const Route = createFileRoute("/_authed/_shell/threads/")({
  validateSearch: (search: Record<string, unknown>): { project?: string } => ({
    project:
      typeof search.project === "string" && search.project !== "" ? search.project : undefined,
  }),
  component: NewThread,
});

function NewThread() {
  const startThread = useStartThread();
  const { projects, addFolder, addGithubRepository } = useProjects();
  const { threads, shared, all } = useThreads();
  const computer = useNewThreadComputer();
  const wide = useMediaQuery("(min-width: 768px)");
  const open = threads.filter((thread) => thread.state === "open");
  const openShared = shared.filter((thread) => thread.state === "open");
  const recent = wide ? open.slice(0, 3) : open;
  const sharedRecent = wide ? openShared.slice(0, 3) : openShared;
  const asked = Route.useSearch().project;
  const [chosen, setProjectId] = useState<string | undefined>(undefined);
  const picked = projects.find((project) => project.id === (chosen ?? asked));
  const fitting = projects.filter((project) => projectFits(project, computer.runtime));
  const fallback = recentProjects(fitting, all)[0] ?? fitting[0];
  const projectId = picked && projectFits(picked, computer.runtime) ? picked.id : fallback?.id;
  const [adding, setAdding] = useState(false);

  const start = (message: OutgoingMessage, selection: RunSelection) =>
    startThread(projectId, message, selection, computer.runtimeId);

  async function addAndChoose(made: Promise<{ id: string } | null>) {
    setAdding(true);
    const project = await made;
    setAdding(false);

    if (project) setProjectId(project.id);
  }

  return (
    <div className="flex min-h-[calc(100svh-var(--mobile-chrome))] flex-col md:min-h-[calc(100svh-2px)]">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 p-4">
        <div className="flex flex-col gap-1.5 text-center">
          <Suspense fallback={<div className="h-24 md:h-32" />}>
            <GlassMark />
          </Suspense>
          <h1 className="text-lg font-medium tracking-tight text-muted-foreground md:text-xl">
            What should we build?
          </h1>
        </div>

        {computer.loaded && (
          <PromptInput
            autoFocus
            onSubmit={start}
            tools={
              <>
                <RuntimePicker
                  choices={computer.choices}
                  value={computer.runtimeId}
                  onChange={computer.choose}
                />
                <ProjectMenu
                  runtime={computer.runtime}
                  projects={projects}
                  threads={all}
                  value={projectId}
                  adding={adding}
                  onPick={setProjectId}
                  onAddFolder={(path) =>
                    computer.runtime &&
                    void addAndChoose(addFolder({ runtimeId: computer.runtime.id, path }))
                  }
                  onAddRepository={(installationId, repository) =>
                    void addAndChoose(
                      addGithubRepository({
                        installationId,
                        repository: repository.fullName,
                      }),
                    )
                  }
                />
              </>
            }
          />
        )}

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
