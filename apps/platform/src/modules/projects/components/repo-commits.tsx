import { layoutGraph, type GraphRow } from "@aven/protocol/commit-graph";
import { ChevronLeft, ChevronRight, GitBranch, GitCommit, Tag } from "@mynaui/icons-react";
import { useMemo, useState, type ReactNode } from "react";

import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { SectionCard } from "@/components/section-card";
import { Skeleton } from "@/components/skeleton";
import { timeAgo } from "@/lib/format";

import { useProjectCommits } from "../hooks/use-project-commits";
import { hasWords } from "@/lib/words";
import { commitUrl } from "../repo-links";
import type { Project, RepoCommit } from "../types";
import { CommitGraphRow, ROW_HEIGHT } from "./commit-graph";

const CHIPS_SHOWN = 2;

// The branches that end on a commit, the default branch first; the rest are a count.
function Branches({ refs, defaultBranch }: { refs: string[]; defaultBranch: string }) {
  const ordered = [...refs].sort(
    (a, b) => Number(b === defaultBranch) - Number(a === defaultBranch) || a.localeCompare(b),
  );
  const shown = ordered.slice(0, CHIPS_SHOWN);
  const more = ordered.length - shown.length;
  return (
    <>
      {shown.map((name) => (
        <Badge
          key={name}
          variant={name === defaultBranch ? "secondary" : "outline"}
          title={name}
          className="max-w-32"
        >
          <GitBranch />
          <span className="truncate">{name}</span>
        </Badge>
      ))}
      {more > 0 && (
        <Badge variant="outline" title={ordered.slice(CHIPS_SHOWN).join(", ")}>
          +{more}
        </Badge>
      )}
    </>
  );
}

function Commit({
  project,
  commit,
  row,
  lanes,
  onOpen,
}: {
  project: Project;
  commit: RepoCommit;
  row: GraphRow;
  lanes: number;
  onOpen?: () => void;
}) {
  return (
    <li
      className="flex items-center gap-3 pr-4 pl-3 text-sm hover:bg-muted/50"
      style={{ height: ROW_HEIGHT }}
    >
      <CommitGraphRow row={row} lanes={lanes} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          {onOpen ? (
            <a
              href={commitUrl(project.repoFullName, commit.sha)}
              title={commit.message}
              onClick={(event) => {
                event.preventDefault();
                onOpen();
              }}
              className="truncate hover:underline"
            >
              {commit.message || "No message"}
            </a>
          ) : (
            <span className="truncate" title={commit.message}>
              {commit.message || "No message"}
            </span>
          )}
          <Branches refs={commit.refs} defaultBranch={project.defaultBranch} />
          {commit.tags.slice(0, 2).map((name) => (
            <Badge key={name} variant="default" title={`Tag ${name}`} className="max-w-28">
              <Tag />
              <span className="truncate">{name}</span>
            </Badge>
          ))}
        </div>
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

// The latest commits of the project's default branch, ten to a page, newest first, drawn as a graph
// of the branches and merges among them (decision 0090).
export function RepoCommits({
  project,
  onOpenCommit,
  filters = "",
  grep,
  actions,
  chips,
}: {
  project: Project;
  /** Controls for the card's header, such as filters. */
  actions?: ReactNode;
  /** What shows under the header, such as the filters that are on. */
  chips?: ReactNode;
  /** The query of the history's filters (author, time, file, branch), already encoded. */
  filters?: string;
  /** Words the messages shown must have; a page of commits is read, and those without are left out. */
  grep?: string;
  /** Given, a commit's message opens it where it is shown rather than on GitHub. */
  onOpenCommit?: (sha: string) => void;
}) {
  // A page is of one set of filters: other filters start at the first page.
  const [at, setAt] = useState({ filters, page: 1 });
  const page = at.filters === filters ? at.page : 1;
  const setPage = (next: number) => setAt({ filters, page: next });
  const { commits: read, hasMore, problem, loading } = useProjectCommits(project.id, page, filters);
  const commits = useMemo(
    () => read?.filter((commit) => !grep || hasWords(commit.message, grep)),
    [read, grep],
  );
  const graph = useMemo(() => layoutGraph(commits ?? []), [commits]);

  return (
    <SectionCard
      label="Commits"
      title={
        <>
          <GitCommit className="size-4 text-muted-foreground" />
          Commits
        </>
      }
      actions={actions}
    >
      {chips}
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
        <ul className="flex flex-col">
          {commits.map((commit, index) => (
            <Commit
              key={commit.sha}
              project={project}
              commit={commit}
              row={graph.rows[index]!}
              lanes={graph.lanes}
              onOpen={onOpenCommit && (() => onOpenCommit(commit.sha))}
            />
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
