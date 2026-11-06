import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import type {
  Project,
  RepoCommit,
  RepoCommitPage,
  TrackedItem,
  TrackedPage,
  TrackedState,
} from "@/modules/projects/types";

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
// listed, not allowed to empty the rest. `withCommits` is off where one project's own commit graph
// is shown instead.
export function useCenterFeed(
  projects: Project[],
  state: TrackedState,
  withCommits: boolean,
  refresh: number,
) {
  const key = `${projects.map((project) => project.id).join(",")}\n${state}\n${withCommits}\n${refresh}`;
  const [answer, setAnswer] = useState<{ key: string; feed: Feed }>();

  useEffect(() => {
    let current = true;
    void (async () => {
      const feed: Feed = { pulls: [], commits: [], unreadable: [] };
      await Promise.all(
        projects.map(async (project) => {
          try {
            const [pulls, commits] = await Promise.all([
              api<TrackedPage>(`/projects/${project.id}/pulls?state=${state}&page=1`),
              withCommits
                ? api<RepoCommitPage>(`/projects/${project.id}/commits?page=1`)
                : undefined,
            ]);
            feed.pulls.push(...pulls.items.map((item) => ({ project, item })));
            feed.commits.push(...(commits?.commits ?? []).map((commit) => ({ project, commit })));
          } catch {
            feed.unreadable.push(project);
          }
        }),
      );
      feed.pulls.sort((a, b) => b.item.updatedAt.localeCompare(a.item.updatedAt));
      feed.commits.sort((a, b) => b.commit.date.localeCompare(a.commit.date));
      if (current) setAnswer({ key, feed });
    })();
    return () => {
      current = false;
    };
    // `key` stands for the projects, the state and the rest.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const mine = answer?.key === key ? answer.feed : undefined;
  return { feed: mine, loading: mine === undefined };
}
