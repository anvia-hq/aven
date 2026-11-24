import { IconGitFork } from "@tabler/icons-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { Button } from "@aven/ui/button";
import { useGitTabs } from "@/modules/git-center/hooks/use-git-tabs";
import { useProjects } from "@/modules/projects/hooks/use-projects";

export const Route = createFileRoute("/_authed/git/")({
  component: GitCenterIndexPage,
});

function GitCenterIndexPage() {
  const navigate = useNavigate();
  const { projects } = useProjects();
  const { tabIds } = useGitTabs();

  useEffect(() => {
    if (!projects || projects.length === 0) return;

    const preferred = tabIds.find((id) => projects.some((p) => p.id === id)) ?? projects[0]!.id;
    void navigate({ to: "/git/$projectId", params: { projectId: preferred }, replace: true });
  }, [navigate, projects, tabIds]);

  if (projects === null) return null;

  if (projects.length > 0) return null;

  return (
    <main className="flex h-[calc(100svh-var(--mobile-chrome))] flex-col items-center justify-center gap-3 bg-background p-6 text-center md:h-svh">
      <IconGitFork className="size-10 text-muted-foreground/50" />
      <h1 className="text-lg font-semibold">Git Center</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Add a folder or GitHub repository in Projects to inspect branches, commits, worktrees, and
        pull requests here.
      </p>
      <Button onClick={() => void navigate({ to: "/projects" })}>Go to Projects</Button>
    </main>
  );
}
