import type { Thread } from "@/modules/threads/types";

import { BackgroundTasksCard } from "./background-tasks-card";
import { ContextCard } from "./context-card";
import { EnvironmentCard } from "./environment-card";
import { UsageCard } from "./usage-card";
import type { ThreadUsage } from "@aven/protocol/types";

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
  return (
    <aside
      aria-label="Overview"
      className="sticky top-0 hidden w-72 shrink-0 flex-col gap-3 self-start p-3 @4xl:flex"
    >
      <EnvironmentCard thread={thread} />
      {owned && <BackgroundTasksCard threadId={thread.id} running={thread.running} />}
      <ContextCard
        context={usage?.context}
        loading={!synced}
        onCompact={owned ? onCompact : undefined}
      />
      <UsageCard totals={usage?.totals} loading={!synced} />
    </aside>
  );
}
