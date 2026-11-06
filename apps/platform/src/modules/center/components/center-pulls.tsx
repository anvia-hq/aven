import { GitPullRequest } from "@mynaui/icons-react";

import { SectionCard } from "@/components/section-card";
import { Skeleton } from "@/components/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/toggle-group";
import { TrackedRow } from "@/modules/projects/components/repo-tracked";
import type { TrackedState } from "@/modules/projects/types";

import type { PullEntry } from "../hooks/use-center-feed";

const PRESSED = "aria-pressed:bg-secondary aria-pressed:text-secondary-foreground";
const isState = (value: unknown): value is TrackedState => value === "open" || value === "closed";

// The pull requests of the projects shown, the latest changed first, open or closed.
export function CenterPulls({
  pulls,
  loading,
  state,
  onState,
}: {
  pulls: PullEntry[] | undefined;
  loading: boolean;
  state: TrackedState;
  onState: (state: TrackedState) => void;
}) {
  return (
    <SectionCard
      label="Pull requests"
      title={
        <>
          <GitPullRequest className="size-4 text-muted-foreground" />
          Pull requests
        </>
      }
      actions={
        <ToggleGroup
          value={[state]}
          onValueChange={([next]) => isState(next) && onState(next)}
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="State"
        >
          <ToggleGroupItem value="open" className={PRESSED}>
            Open
          </ToggleGroupItem>
          <ToggleGroupItem value="closed" className={PRESSED}>
            Closed
          </ToggleGroupItem>
        </ToggleGroup>
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
            />
          ))}
          {pulls.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">No {state} pull requests.</li>
          )}
        </ul>
      )}
    </SectionCard>
  );
}
