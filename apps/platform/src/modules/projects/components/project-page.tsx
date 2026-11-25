import { IconGitFork, IconPlus } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@aven/ui/button";
import { SectionCard } from "@aven/ui/section-card";
import { Skeleton } from "@aven/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@aven/ui/tabs";
import { NotFound } from "@/components/not-found";
import { ThreadList } from "@/modules/threads/components/thread-list";
import { useThreads } from "@/modules/threads/hooks/use-threads";
import { InheritedVariables } from "@/modules/variables/components/inherited-variables";
import { VariablesSection } from "@/modules/variables/components/variables-section";

import { useProject } from "../hooks/use-project";
import type { ProjectTab } from "../types";
import { ProjectAbout } from "./project-about";
import { ProjectTitle } from "./project-title";
import { RepoCommits } from "./repo-commits";
import { RepoFiles } from "./repo-files";
import { RepoReadme } from "./repo-readme";
import { RepoTracked } from "./repo-tracked";

export function ProjectDetailPage({
  projectId,
  path,
  tab,
}: {
  projectId: string;
  path: string;
  tab?: ProjectTab;
}) {
  const navigate = useNavigate();
  const { project, loaded } = useProject(projectId);
  const threads = useThreads().all.filter((thread) => thread.projectId === projectId);

  if (!project) {
    if (!loaded) {
      return (
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-12 rounded-xl" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-24 rounded-lg" />
              <Skeleton className="h-8 w-28 rounded-lg" />
            </div>
          </div>
          <Skeleton className="h-9 w-80 rounded-lg" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </main>
      );
    }

    return <NotFound as="main" title="Project not found" to="/projects" back="Back to projects" />;
  }

  const activeTab: ProjectTab = path !== "" ? "code" : (tab ?? "code");

  return (
    <main className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ProjectTitle project={project} />
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/git/$projectId", params: { projectId: project.id } })}
          >
            <IconGitFork />
            Git Center
          </Button>
          <Button onClick={() => navigate({ to: "/threads", search: { project: project.id } })}>
            <IconPlus />
            Start thread
          </Button>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(next) => {
          const chosen = next as ProjectTab;
          void navigate({
            to: "/projects/$projectId",
            params: { projectId: project.id },
            search: chosen === "code" ? {} : { tab: chosen },
            replace: true,
          });
        }}
        className="flex-col gap-5"
      >
        <TabsList aria-label="Project sections" className="h-9">
          <TabsTrigger value="code">Code</TabsTrigger>
          <TabsTrigger value="threads" className="gap-1.5">
            <span>Threads</span>
            {threads.length > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">{threads.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="code" className="flex min-w-0 flex-col gap-4">
          <RepoFiles project={project} path={path} />
          {path === "" && <RepoReadme project={project} />}
        </TabsContent>

        <TabsContent value="threads" className="flex min-w-0 flex-col gap-4">
          <SectionCard title="Recent threads">
            <div className="p-1">
              <ThreadList threads={threads} empty="No threads in this project yet." />
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="activity" className="flex min-w-0 flex-col gap-4">
          {project.repoFullName && (
            <RepoTracked key={`tracked-${project.id}`} projectId={project.id} />
          )}
          <RepoCommits key={project.id} project={project} />
        </TabsContent>

        <TabsContent value="settings" className="flex max-w-3xl min-w-0 flex-col gap-4">
          <ProjectAbout project={project} />
          <VariablesSection
            framed
            scope={{ kind: "project", projectId: project.id }}
            title="Environment variables"
            empty="None yet. Add what the project needs to run, such as a database URL or an API key."
          />
          <InheritedVariables framed projectId={project.id} />
        </TabsContent>
      </Tabs>
    </main>
  );
}
