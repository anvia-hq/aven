import type { ThreadUsage } from "@aven/protocol/events";

import type { Thread } from "@/modules/threads/types";

import { BackgroundTasksCard } from "./background-tasks-card";
import { ContextCard } from "./context-card";
import { EnvironmentCard } from "./environment-card";
import { UsageCard } from "./usage-card";

// The thread's overview beside its conversation. It needs room, so it only shows when the
// conversation panel is wide enough; the panel is a container for that. It sticks to the top of
// the conversation's scroll area, which keeps the scrollbar at the panel's edge.
export function OverviewColumn({ thread, usage }: { thread: Thread; usage: ThreadUsage | null }) {
  return (
    <aside
      aria-label="Overview"
      className="sticky top-0 hidden w-72 shrink-0 flex-col gap-3 self-start p-3 @4xl:flex"
    >
      <EnvironmentCard thread={thread} />
      <BackgroundTasksCard threadId={thread.id} running={thread.running} />
      <ContextCard context={usage?.context} />
      <UsageCard totals={usage?.totals} />
    </aside>
  );
}
