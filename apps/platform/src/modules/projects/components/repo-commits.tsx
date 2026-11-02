import { ChevronLeft, ChevronRight, GitCommit } from "@mynaui/icons-react";
import { useState } from "react";

import { Button } from "@/components/button";
import { SectionCard } from "@/components/section-card";
import { Skeleton } from "@/components/skeleton";
import { timeAgo } from "@/lib/format";

import { useProjectCommits } from "../hooks/use-project-commits";
import { commitUrl } from "../repo-links";
import type { Project, RepoCommit } from "../types";

function Commit({ project, commit }: { project: Project; commit: RepoCommit }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 text-sm">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate" title={commit.message}>
          {commit.message || "No message"}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {commit.author ?? "Unknown author"}
          {commit.date ? ` · ${timeAgo(commit.date, true)}` : ""}
        </span>
      </div>
      {/* The commit is read on GitHub: the app shows the history, not each change. */}
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
  );
}

// The latest commits of the project's default branch, ten to a page, newest first.
export function RepoCommits({ project }: { project: Project }) {
  const [page, setPage] = useState(1);
  const { commits, hasMore, problem, loading } = useProjectCommits(project.id, page);

  return (
    <SectionCard
      label="Commits"
      title={
        <>
          <GitCommit className="size-4 text-muted-foreground" />
          Commits
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
      {problem !== undefined && (
        <p className="p-4 text-sm text-muted-foreground">
          Could not read the commits on GitHub. {problem}
        </p>
      )}
      {commits && (
        <ul className="flex flex-col divide-y">
          {commits.map((commit) => (
            <Commit key={commit.sha} project={project} commit={commit} />
          ))}
          {commits.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">No commits yet.</li>
          )}
        </ul>
      )}
      {(page > 1 || hasMore) && (
        <nav
          aria-label="Commit pages"
          className="flex items-center justify-between gap-2 border-t px-4 py-2"
        >
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1 || loading}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft />
            Newer
          </Button>
          <span className="text-xs text-muted-foreground">Page {page}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasMore || loading}
            onClick={() => setPage(page + 1)}
          >
            Older
            <ChevronRight />
          </Button>
        </nav>
      )}
    </SectionCard>
  );
}
