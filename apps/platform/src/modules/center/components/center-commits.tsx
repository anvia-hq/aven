import { GitBranch, GitCommit } from "@mynaui/icons-react";

import { Badge } from "@/components/badge";
import { SectionCard } from "@/components/section-card";
import { Skeleton } from "@/components/skeleton";
import { timeAgo } from "@/lib/format";
import { ProjectTile } from "@/modules/projects/components/project-tile";
import { commitUrl } from "@/modules/projects/repo-links";
import type { Project } from "@/modules/projects/types";

import type { CommitEntry } from "../hooks/use-center-feed";

const LATEST_SHOWN = 30;

// The latest commits of all the projects together, newest first. A graph needs one history, so it is
// the single project's view that draws one.
export function CenterCommits({
  commits,
  loading,
  onOpen,
}: {
  commits: CommitEntry[] | undefined;
  loading: boolean;
  onOpen: (project: Project, sha: string) => void;
}) {
  return (
    <SectionCard
      label="Commits"
      title={
        <>
          <GitCommit className="size-4 text-muted-foreground" />
          Latest commits
        </>
      }
    >
      {loading && (
        <div className="flex flex-col gap-3 p-4" aria-busy>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      )}
      {commits && (
        <ul className="flex flex-col">
          {commits.slice(0, LATEST_SHOWN).map(({ project, commit }) => (
            <li
              key={`${project.id}:${commit.sha}`}
              className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted/50"
            >
              <ProjectTile projectId={project.id} name={project.name} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex min-w-0 items-center gap-2">
                  <a
                    href={commitUrl(project.repoFullName, commit.sha)}
                    title={commit.message}
                    onClick={(event) => {
                      event.preventDefault();
                      onOpen(project, commit.sha);
                    }}
                    className="truncate hover:underline"
                  >
                    {commit.message || "No message"}
                  </a>
                  {commit.refs.slice(0, 1).map((name) => (
                    <Badge key={name} variant="outline" title={name} className="max-w-32">
                      <GitBranch />
                      <span className="truncate">{name}</span>
                    </Badge>
                  ))}
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  {project.name} · {commit.author ?? "Unknown author"}
                  {commit.date ? ` · ${timeAgo(commit.date, true)}` : ""}
                </span>
              </div>
              <a
                href={commitUrl(project.repoFullName, commit.sha)}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={`Open commit ${commit.sha.slice(0, 7)} on GitHub`}
                className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground hover:text-foreground"
              >
                {commit.sha.slice(0, 7)}
              </a>
            </li>
          ))}
          {commits.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">No commits yet.</li>
          )}
        </ul>
      )}
    </SectionCard>
  );
}
