import { Refresh } from "@mynaui/icons-react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { Button } from "@/components/button";
import { RepoCommits } from "@/modules/projects/components/repo-commits";
import { useGithubAccount } from "@/modules/projects/hooks/use-github-account";
import { useProjects } from "@/modules/projects/hooks/use-projects";
import type { Project } from "@/modules/projects/types";

import {
  commitFilterQuery,
  filtersOf,
  pullsQuery,
  QUICK_VIEWS,
  quickViewSearch,
  type CenterSearch,
} from "../filters";
import { useCenterFeed } from "../hooks/use-center-feed";
import { useProjectBranches } from "../hooks/use-project-branches";
import { CenterBranches } from "./center-branches";
import { CenterCommits } from "./center-commits";
import { CenterDetail, openOf } from "./center-detail";
import { CenterPulls, type PullsView } from "./center-pulls";
import { clearCommits, CommitFilters, commitChips, CommitSearch } from "./commit-filters";
import { FilterChips } from "./filter-chips";
import { QuickViews } from "./quick-views";

// Center: the pull requests and commits of the person's projects on one screen, read from GitHub
// like each project's own page. All the projects together, or one with its branches and its commit
// graph.
export function CenterPage() {
  const search = useSearch({ from: "/_authed/center/" });
  const { project: selected } = search;
  const filters = useMemo(() => filtersOf(search), [search]);
  const account = useGithubAccount();
  const login = account?.data?.connected ? account.data.login : null;
  const navigate = useNavigate();
  const { projects, loaded } = useProjects();
  const [refresh, setRefresh] = useState(0);
  const [view, setView] = useState<PullsView>("pulls");

  const one = projects.find((project) => project.id === selected);
  const shown = one ? [one] : projects;
  const commitFilters = commitFilterQuery(search, one !== undefined);
  const { feed, loading } = useCenterFeed(
    shown,
    pullsQuery(filters, login),
    filters.sort,
    // One project's commits are its graph's own, read by `RepoCommits`.
    one ? null : `page=1${commitFilters && `&${commitFilters}`}`,
    search.grep,
    refresh,
  );
  const branches = useProjectBranches(one?.id, refresh);

  // A change to the filters is a change of the address, so the view can be kept and shared.
  const change = (next: CenterSearch) =>
    void navigate({
      to: "/center",
      search: (previous) => ({ ...previous, ...next }),
      replace: true,
    });

  const detail = openOf(search);
  const openPull = (project: Project, number: number) =>
    change({ pr: `${project.id}:${number}`, commit: undefined });
  const openCommit = (project: Project, sha: string) =>
    change({ commit: `${project.id}:${sha}`, pr: undefined });

  const chips = commitChips(search, change);
  const commitActions = (
    <>
      <CommitSearch value={search.grep} onChange={(grep) => change({ grep })} />
      <CommitFilters
        search={search}
        branches={one ? (branches?.data?.branches ?? []) : undefined}
        count={chips.filter((chip) => chip.key !== "grep").length}
        onChange={change}
      />
    </>
  );
  const commitChipsRow = (
    <FilterChips name="Active commit filters" chips={chips} onClear={() => change(clearCommits)} />
  );

  // A project that is gone, or not the person's, shows all of them.
  if (loaded && selected !== undefined && !one) {
    void navigate({ to: "/center", search: {}, replace: true });
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 md:py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{one ? one.name : "Center"}</h1>
          <p className="text-sm text-muted-foreground">
            {one
              ? one.repoFullName
              : "Pull requests and commits across all your projects, read from GitHub."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => setRefresh((count) => count + 1)}
        >
          <Refresh />
          Refresh
        </Button>
      </header>
      {loaded && projects.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Import a repository to see its pull requests and commits here.
        </p>
      )}
      {feed && feed.unreadable.length > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          Could not read GitHub for {feed.unreadable.map((project) => project.name).join(", ")}.
        </p>
      )}
      {projects.length > 0 && (
        <>
          <QuickViews
            filters={filters}
            connected={login !== null}
            onPick={(id) => {
              const quick = QUICK_VIEWS.find((candidate) => candidate.id === id)!;
              setView("pulls");
              void navigate({ to: "/center", search: quickViewSearch(quick, selected) });
            }}
          />
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <CenterPulls
              pulls={feed?.pulls}
              loading={loading}
              filters={filters}
              onChange={change}
              onOpen={openPull}
              view={view}
              onView={setView}
              branches={
                one
                  ? {
                      count: `${branches?.data?.branches.length ?? "…"}${branches?.data?.truncated ? "+" : ""}`,
                      panel: (
                        <CenterBranches
                          branches={branches}
                          selected={search.branch}
                          onSelect={(branch) => change({ branch })}
                          onOpenPull={(number) => openPull(one, number)}
                        />
                      ),
                    }
                  : undefined
              }
            />
            {one ? (
              <RepoCommits
                project={one}
                filters={commitFilters}
                grep={search.grep}
                onOpenCommit={(sha) => openCommit(one, sha)}
                actions={commitActions}
                chips={commitChipsRow}
              />
            ) : (
              <CenterCommits
                commits={feed?.commits}
                loading={loading}
                onOpen={openCommit}
                actions={commitActions}
                chips={commitChipsRow}
              />
            )}
          </div>
        </>
      )}
      <CenterDetail open={detail} onClose={() => change({ pr: undefined, commit: undefined })} />
    </div>
  );
}
