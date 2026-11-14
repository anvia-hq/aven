import { useEffect, useState } from "react";

import { api } from "@/lib/api";

import { hasWords } from "@/lib/words";

import type { Project, RepoCommitPage, TrackedPage } from "@/modules/projects/types";
import type { CenterFilters, CommitEntry, PullEntry } from "../types";

const PULL_ORDER: Record<CenterFilters["sort"], (a: PullEntry, b: PullEntry) => number> = {
  updated: (a, b) => b.item.updatedAt.localeCompare(a.item.updatedAt),
  oldest: (a, b) => a.item.updatedAt.localeCompare(b.item.updatedAt),
  created: (a, b) => b.item.number - a.item.number,
  comments: (a, b) => b.item.comments - a.item.comments,
};

type Feed = {
  pulls: PullEntry[];
  commits: CommitEntry[];
  unreadable: Project[];
};

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
          if (!project.repoFullName) return;

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
              ...(commits?.commits ?? []).flatMap((commit) =>
                hasWords(commit.message, grep) ? [{ project, commit }] : [],
              ),
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
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const mine = answer?.key === key ? answer.feed : undefined;
  return { feed: mine, loading: mine === undefined };
}
