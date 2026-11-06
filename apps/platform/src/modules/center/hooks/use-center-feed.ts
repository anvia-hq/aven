import { useEffect, useState } from "react";

import { api } from "@/lib/api";

import { hasWords } from "@/lib/words";

import type { CenterFilters } from "../filters";
import type {
  Project,
  RepoCommit,
  RepoCommitPage,
  TrackedItem,
  TrackedPage,
} from "@/modules/projects/types";

// The order of the pull requests is the query's own, so the lists of the projects are put together
// by the one thing every sort has: the time they changed (or, for the oldest, the reverse).
const PULL_ORDER: Record<CenterFilters["sort"], (a: PullEntry, b: PullEntry) => number> = {
  updated: (a, b) => b.item.updatedAt.localeCompare(a.item.updatedAt),
  oldest: (a, b) => a.item.updatedAt.localeCompare(b.item.updatedAt),
  created: (a, b) => b.item.number - a.item.number,
  comments: (a, b) => b.item.comments - a.item.comments,
};

export type PullEntry = { project: Project; item: TrackedItem };
export type CommitEntry = { project: Project; commit: RepoCommit };

type Feed = {
  pulls: PullEntry[];
  commits: CommitEntry[];
  /** Projects GitHub could not be asked about, so the page can say what is missing. */
  unreadable: Project[];
};

// The pull requests and the latest commits of several projects, read from GitHub through each
// project's own endpoints and put together, the latest first. A project that cannot be read is
// listed, not allowed to empty the rest. `commitsQuery` is null where one project's own commit graph
// is shown instead.
export function useCenterFeed(
  projects: Project[],
  pullsQuery: string | null,
  sort: CenterFilters["sort"],
  commitsQuery: string | null,
  grep: string | undefined,
  refresh: number,
) {
  const key = `${projects.map((project) => project.id).join(",")}\n${pullsQuery}\n${commitsQuery}\n${grep}\n${refresh}`;
  const [answer, setAnswer] = useState<{ key: string; feed: Feed }>();

  useEffect(() => {
    let current = true;
    void (async () => {
      const feed: Feed = { pulls: [], commits: [], unreadable: [] };
      await Promise.all(
        projects.map(async (project) => {
          try {
            const [pulls, commits] = await Promise.all([
              pullsQuery === null
                ? { items: [], total: 0, hasMore: false }
                : api<TrackedPage>(`/projects/${project.id}/pulls?${pullsQuery}`),
              commitsQuery === null
                ? undefined
                : api<RepoCommitPage>(`/projects/${project.id}/commits?${commitsQuery}`),
            ]);
            feed.pulls.push(...pulls.items.map((item) => ({ project, item })));
            feed.commits.push(
              ...(commits?.commits ?? [])
                .filter((commit) => hasWords(commit.message, grep))
                .map((commit) => ({ project, commit })),
            );
          } catch {
            feed.unreadable.push(project);
          }
        }),
      );
      feed.pulls.sort(PULL_ORDER[sort]);
      feed.commits.sort((a, b) => b.commit.date.localeCompare(a.commit.date));
      if (current) setAnswer({ key, feed });
    })();
    return () => {
      current = false;
    };
    // `key` stands for the projects, the query and the rest.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const mine = answer?.key === key ? answer.feed : undefined;
  return { feed: mine, loading: mine === undefined };
}
