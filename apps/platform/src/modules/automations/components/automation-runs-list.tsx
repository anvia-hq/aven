import { IconAlertTriangle, IconCheck, IconExternalLink, IconLoader2 } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";

import { timeAgo } from "@/lib/format";

import type { AutomationRun } from "../types";

function RunGlyph({ status }: { status: AutomationRun["status"] }) {
  if (status === "running") {
    return <IconLoader2 aria-hidden className="size-3.5 shrink-0 animate-spin text-meter" />;
  }

  if (status === "done")
    return <IconCheck aria-hidden className="size-3.5 shrink-0 text-success" />;

  return <IconAlertTriangle aria-hidden className="size-3.5 shrink-0 text-destructive" />;
}

export function AutomationRunsList({
  runs,
  loading,
}: {
  runs: readonly AutomationRun[];
  loading: boolean;
}) {
  if (loading) {
    return <p className="py-2 text-xs text-muted-foreground">Loading recent runs…</p>;
  }

  if (runs.length === 0) {
    return <p className="py-2 text-xs text-muted-foreground">No runs yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60 bg-muted/15">
      {runs.map((run) => (
        <li key={run.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <RunGlyph status={run.status} />
            <span className="min-w-0 truncate text-foreground">{run.triggerSummary}</span>
            {run.error && <span className="min-w-0 truncate text-destructive">{run.error}</span>}
          </div>
          <div className="flex shrink-0 items-center gap-3 text-muted-foreground">
            <span>{timeAgo(run.createdAt, true)}</span>
            {run.threadId && (
              <Link
                to="/threads/$threadId"
                params={{ threadId: run.threadId }}
                className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
              >
                <span>Open thread</span>
                <IconExternalLink aria-hidden className="size-3" />
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
