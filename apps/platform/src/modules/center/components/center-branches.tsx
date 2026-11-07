import { ArrowDown, ArrowUp, Lock } from "@mynaui/icons-react";

import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Skeleton } from "@/components/skeleton";
import type { useRequest } from "@/hooks/use-request";
import { timeAgo } from "@/lib/format";

import type { BranchList, BranchSummary } from "../types";

const STALE_DAYS = 30;

export const isStale = (branch: BranchSummary, now = Date.now()) =>
  !branch.isDefault &&
  branch.pull === null &&
  branch.lastCommit !== null &&
  now - Date.parse(branch.lastCommit.date) > STALE_DAYS * 86_400_000;

type Props = {
  branches: ReturnType<typeof useRequest<BranchList>>;
  selected: string | undefined;
  onSelect: (branch: string | undefined) => void;
  onOpenPull: (number: number) => void;
};

export function CenterBranches({ branches, selected, onSelect, onOpenPull }: Props) {
  const list = branches?.data;
  return (
    <section aria-label="Branches">
      {!branches && (
        <div className="flex flex-col gap-3 p-4" aria-busy>
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      )}
      {branches?.error && (
        <p className="p-4 text-sm text-muted-foreground">
          Could not read the branches on GitHub. {branches.error}
        </p>
      )}
      {list && (
        <ul className="flex flex-col lg:max-h-[calc(100svh-15rem)] lg:overflow-y-auto">
          {list.branches.map((branch) => {
            const chosen = selected === branch.name;
            return (
              <li
                key={branch.name}
                className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted/50"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Button
                      variant={chosen ? "secondary" : "ghost"}
                      size="xs"
                      aria-pressed={chosen}
                      title={
                        chosen ? "Show the default branch again" : "Show this branch's commits"
                      }
                      onClick={() => onSelect(chosen || branch.isDefault ? undefined : branch.name)}
                      className="h-6 max-w-56 px-1.5 font-mono"
                    >
                      <span className="truncate">{branch.name}</span>
                    </Button>
                    {branch.isDefault && <Badge variant="secondary">Default</Badge>}
                    {branch.protected && (
                      <Lock
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-label="Protected"
                      />
                    )}
                    {isStale(branch) && <Badge variant="outline">Stale</Badge>}
                  </div>
                  {branch.lastCommit && (
                    <span className="truncate text-xs text-muted-foreground">
                      {branch.lastCommit.author ?? "Unknown author"}
                      {branch.lastCommit.date ? ` · ${timeAgo(branch.lastCommit.date, true)}` : ""}
                      {` · ${branch.lastCommit.message}`}
                    </span>
                  )}
                </div>
                {!branch.isDefault && (
                  <span
                    className="flex shrink-0 items-center gap-2 font-mono text-xs text-muted-foreground"
                    title={`${branch.ahead} ahead of and ${branch.behind} behind the default branch`}
                  >
                    <span className="flex items-center">
                      <ArrowUp className="size-3" />
                      {branch.ahead}
                    </span>
                    <span className="flex items-center">
                      <ArrowDown className="size-3" />
                      {branch.behind}
                    </span>
                  </span>
                )}
                {branch.pull && (
                  <Button
                    variant="outline"
                    size="xs"
                    title={branch.pull.title}
                    onClick={() => onOpenPull(branch.pull!.number)}
                  >
                    #{branch.pull.number}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
