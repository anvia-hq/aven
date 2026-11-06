import { GitPullRequest } from "@mynaui/icons-react";

import { SectionCard } from "@/components/section-card";
import { Skeleton } from "@/components/skeleton";
import { TrackedRow } from "@/modules/projects/components/repo-tracked";
import type { Project } from "@/modules/projects/types";

import type { PullEntry } from "../hooks/use-center-feed";

// The pull requests of the projects shown, the latest changed first, open or closed.
export function CenterPulls({
  pulls,
  loading,
  onLabel,
  onOpen,
}: {
  pulls: PullEntry[] | undefined;
  loading: boolean;
  onLabel: (label: string) => void;
  onOpen: (project: Project, number: number) => void;
}) {
  return (
    <SectionCard
      label="Pull requests"
      title={
        <>
          <GitPullRequest className="size-4 text-muted-foreground" />
          Pull requests
          {pulls && (
            <span className="text-xs font-normal text-muted-foreground">{pulls.length}</span>
          )}
        </>
      }
    >
      {loading && (
        <div className="flex flex-col gap-3 p-4" aria-busy>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      )}
      {pulls && (
        <ul className="flex flex-col">
          {pulls.map(({ project, item }) => (
            <TrackedRow
              key={`${project.id}:${item.number}`}
              item={item}
              kind="pull"
              project={project}
              onLabel={onLabel}
              onOpen={() => onOpen(project, item.number)}
            />
          ))}
          {pulls.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">
              No pull requests match these filters.
            </li>
          )}
        </ul>
      )}
    </SectionCard>
  );
}
