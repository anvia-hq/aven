import { GitBranch } from "@mynaui/icons-react";

import { GithubMark } from "@/components/brand-icons";

import { useProjectPalettes } from "../hooks/use-project-palettes";
import { repoUrl } from "../repo-links";
import type { Project } from "../types";
import { ProjectTile } from "./project-tile";

// The project as a repository page opens: its tile and name, and the repository on GitHub with its
// default branch.
export function ProjectTitle({ project }: { project: Project }) {
  const palette = useProjectPalettes().get(project.id);

  return (
    <div className="flex items-center gap-3">
      <ProjectTile projectId={project.id} palette={palette} className="size-12" />
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="truncate text-xl font-semibold">{project.name}</h1>
        <div className="flex min-w-0 items-center gap-3 text-sm text-muted-foreground">
          <a
            href={repoUrl(project.repoFullName)}
            target="_blank"
            rel="noreferrer noopener"
            className="flex min-w-0 items-center gap-1.5 hover:text-foreground hover:underline"
          >
            <GithubMark className="size-4 shrink-0" />
            <span className="truncate">{project.repoFullName}</span>
          </a>
          <span className="flex shrink-0 items-center gap-1">
            <GitBranch className="size-4" />
            <span className="font-mono text-xs">{project.defaultBranch}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
