import { IconChevronRight } from "@tabler/icons-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@aven/ui/collapsible";
import type { Thread } from "@/modules/threads/types";

import { BackgroundTasksCard } from "./background-tasks-card";
import { ContextCard } from "./context-card";
import { EnvironmentCard } from "./environment-card";
import { LimitsCard } from "./limits-card";
import { UsageCard } from "./usage-card";
import type { ThreadUsage } from "@aven/protocol/types";

function contextSummary(usage: ThreadUsage | null) {
  const context = usage?.context;

  if (!context?.contextWindow) return null;

  const pct = Math.min(100, Math.round((context.usedTokens / context.contextWindow) * 100));
  return `${pct}% context`;
}

export function OverviewColumn({
  thread,
  usage,
  synced,
  owned,
  onCompact,
}: {
  thread: Thread;
  usage: ThreadUsage | null;
  synced: boolean;
  owned: boolean;
  onCompact?: { run: () => void; busy: boolean; disabled: boolean };
}) {
  const summary = contextSummary(usage);

  return (
    <aside
      aria-label="Overview"
      className="sticky top-0 hidden w-72 shrink-0 flex-col gap-3 self-start p-3 @4xl:flex"
    >
      <EnvironmentCard thread={thread} owned={owned} />
      {owned && (
        <BackgroundTasksCard
          threadId={thread.id}
          backend={thread.agentBackend}
          running={thread.running}
        />
      )}
      <Collapsible defaultOpen={false} className="flex flex-col gap-2">
        <CollapsibleTrigger className="group flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground">
          <span className="flex items-center gap-1.5 font-medium">
            <IconChevronRight
              aria-hidden
              className="size-3.5 transition-transform group-data-[panel-open]:rotate-90"
            />
            <span>Model & usage</span>
          </span>
          {summary && <span className="tabular-nums">{summary}</span>}
        </CollapsibleTrigger>
        <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none">
          <div className="flex flex-col gap-3 pt-1">
            <ContextCard
              context={usage?.context}
              loading={!synced}
              onCompact={owned ? onCompact : undefined}
            />
            {thread.agentBackend === "claude" && <LimitsCard limits={usage?.limits} />}
            <UsageCard totals={usage?.totals} loading={!synced} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </aside>
  );
}
