import { GitBranch, GitCommit, Tag } from "@mynaui/icons-react";
import { useMemo, type ReactNode } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/avatar";
import { Badge } from "@/components/badge";
import { SectionCard } from "@/components/section-card";
import { Skeleton } from "@/components/skeleton";
import { timeAgo } from "@/lib/format";
import { commitUrl } from "@/modules/projects/repo-links";
import type { Project } from "@/modules/projects/types";

import { groupByDay } from "../day-groups";
import type { CommitEntry } from "../types";

const LATEST_SHOWN = 40;

export function CenterCommits({
  commits,
  loading,
  onOpen,
  actions,
  chips,
}: {
  actions?: ReactNode;
  chips?: ReactNode;
  commits: CommitEntry[] | undefined;
  loading: boolean;
  onOpen: (project: Project, sha: string) => void;
}) {
  const groups = useMemo(() => groupByDay((commits ?? []).slice(0, LATEST_SHOWN)), [commits]);
  return (
    <SectionCard
      label="Commits"
      title={
        <>
          <GitCommit className="size-4 text-muted-foreground" />
          Latest commits
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
      {commits && (
        <div className="flex flex-col lg:max-h-[calc(100svh-15rem)] lg:overflow-y-auto">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h3 className="border-b bg-muted/30 px-4 py-1 text-xs font-medium text-muted-foreground">
                {group.label}
              </h3>
              <ul className="flex flex-col">
                {group.entries.map(({ project, commit }) => (
                  <li
                    key={`${project.id}:${commit.sha}`}
                    className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted/50"
                  >
                    <Avatar className="size-7">
                      {commit.authorAvatar && <AvatarImage src={commit.authorAvatar} alt="" />}
                      <AvatarFallback className="text-xs">
                        {(commit.author ?? "?").slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
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
                        {commit.tags.slice(0, 1).map((name) => (
                          <Badge
                            key={name}
                            variant="default"
                            title={`Tag ${name}`}
                            className="max-w-28"
                          >
                            <Tag />
                            <span className="truncate">{name}</span>
                          </Badge>
                        ))}
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
              </ul>
            </section>
          ))}
          {groups.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted-foreground">No commits yet.</p>
          )}
        </div>
      )}
    </SectionCard>
  );
}
