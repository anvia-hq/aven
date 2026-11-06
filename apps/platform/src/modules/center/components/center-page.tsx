import { Refresh } from "@mynaui/icons-react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/button";
import { RepoCommits } from "@/modules/projects/components/repo-commits";
import { useProjects } from "@/modules/projects/hooks/use-projects";
import type { TrackedState } from "@/modules/projects/types";

import { useCenterFeed } from "../hooks/use-center-feed";
import { CenterCommits } from "./center-commits";
import { CenterPulls } from "./center-pulls";

// Center: the pull requests and commits of the person's projects on one screen, read from GitHub
// like each project's own page. All the projects together, or one with its commit graph.
export function CenterPage() {
  const { project: selected } = useSearch({ from: "/_authed/center/" });
  const navigate = useNavigate();
  const { projects, loaded } = useProjects();
  const [state, setState] = useState<TrackedState>("open");
  const [refresh, setRefresh] = useState(0);

  const one = projects.find((project) => project.id === selected);
  const shown = one ? [one] : projects;
  const { feed, loading } = useCenterFeed(shown, state, one === undefined, refresh);

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
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <CenterPulls pulls={feed?.pulls} loading={loading} state={state} onState={setState} />
          {one ? (
            <RepoCommits project={one} />
          ) : (
            <CenterCommits commits={feed?.commits} loading={loading} />
          )}
        </div>
      )}
    </div>
  );
}
