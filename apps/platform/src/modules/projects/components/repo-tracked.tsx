import {
  ChevronLeft,
  ChevronRight,
  Circle,
  GitMerge,
  GitPullRequest,
  Message,
} from "@mynaui/icons-react";
import { useState } from "react";

import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { SectionCard } from "@/components/section-card";
import { Skeleton } from "@/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/toggle-group";
import { timeAgo } from "@/lib/format";

import { useProjectTracked } from "../hooks/use-project-tracked";
import type { Project, TrackedItem, TrackedKind, TrackedState } from "../types";

const isKind = (value: unknown): value is TrackedKind => value === "pull" || value === "issue";
const isState = (value: unknown): value is TrackedState => value === "open" || value === "closed";

const PRESSED = "aria-pressed:bg-secondary aria-pressed:text-secondary-foreground";

export const TRACKED_STATUS = {
  open: { label: "Open", variant: "secondary" },
  draft: { label: "Draft", variant: "outline" },
  merged: { label: "Merged", variant: "default" },
  closed: { label: "Closed", variant: "destructive" },
} as const;

function StatusIcon({ item, kind }: { item: TrackedItem; kind: TrackedKind }) {
  if (item.status === "merged") return <GitMerge className="size-4 shrink-0" />;
  if (kind === "pull") return <GitPullRequest className="size-4 shrink-0" />;
  return <Circle className="size-4 shrink-0" />;
}

export function TrackedRow({
  item,
  kind,
  project,
  onLabel,
  onOpen,
}: {
  item: TrackedItem;
  kind: TrackedKind;
  project?: Project;
  onLabel?: (label: string) => void;
  onOpen?: () => void;
}) {
  const { label, variant } = TRACKED_STATUS[item.status];
  return (
    <li className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted/50">
      <span className="text-muted-foreground">
        <StatusIcon item={item} kind={kind} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            title={item.title}
            onClick={(event) => {
              if (!onOpen) return;
              event.preventDefault();
              onOpen();
            }}
            className="truncate hover:underline"
          >
            {item.title}
          </a>
          <Badge variant={variant}>{label}</Badge>
          {item.labels.slice(0, 3).map((name) =>
            onLabel ? (
              <Button
                key={name}
                variant="outline"
                size="xs"
                title={`Only pull requests labelled ${name}`}
                onClick={() => onLabel(name)}
                className="h-5 max-w-28 rounded-full px-1.5 text-xs text-muted-foreground"
              >
                <span className="truncate">{name}</span>
              </Button>
            ) : (
              <Badge key={name} variant="outline" className="max-w-28">
                <span className="truncate">{name}</span>
              </Badge>
            ),
          )}
        </div>
        <span className="truncate text-xs text-muted-foreground">
          {project ? `${project.name} · ` : ""}#{item.number} · {item.author ?? "Unknown author"} ·
          updated {timeAgo(item.updatedAt, true)}
        </span>
      </div>
      {item.comments > 0 && (
        <span
          className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
          aria-label={`${item.comments} comments`}
        >
          <Message className="size-3.5" />
          {item.comments}
        </span>
      )}
    </li>
  );
}

const NOUN: Record<TrackedKind, string> = { pull: "pull requests", issue: "issues" };

export function RepoTracked({ projectId }: { projectId: string }) {
  const [kind, setKind] = useState<TrackedKind>("pull");
  const [state, setState] = useState<TrackedState>("open");
  const [page, setPage] = useState(1);
  const { items, total, hasMore, problem, loading } = useProjectTracked(
    projectId,
    kind,
    state,
    page,
  );

  const choose = (change: () => void) => {
    change();
    setPage(1);
  };

  return (
    <SectionCard
      label="Pull requests and issues"
      title={
        <Tabs value={kind} onValueChange={(next) => isKind(next) && choose(() => setKind(next))}>
          <TabsList variant="line" aria-label="Kind">
            <TabsTrigger value="pull">Pull requests</TabsTrigger>
            <TabsTrigger value="issue">Issues</TabsTrigger>
          </TabsList>
        </Tabs>
      }
      actions={
        <ToggleGroup
          value={[state]}
          onValueChange={([next]) => isState(next) && choose(() => setState(next))}
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
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      )}
      {problem !== undefined && (
        <p className="p-4 text-sm text-muted-foreground">
          Could not read the {NOUN[kind]} on GitHub. {problem}
        </p>
      )}
      {items && (
        <ul className="flex flex-col">
          {items.map((item) => (
            <TrackedRow key={item.number} item={item} kind={kind} />
          ))}
          {items.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">
              No {state} {NOUN[kind]}.
            </li>
          )}
        </ul>
      )}
      {(page > 1 || hasMore) && (
        <nav
          aria-label="Pages"
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
          <span className="text-xs text-muted-foreground">
            Page {page}
            {total !== undefined && ` · ${total} in all`}
          </span>
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
