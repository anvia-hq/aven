import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@aven/ui/collapsible";

import { useFixProcess } from "../hooks/use-fix-process";
import { useThreadProcesses } from "../hooks/use-thread-processes";
import { BackgroundProcess } from "./background-process";
import { OverviewCard } from "./overview-card";
import type { AgentBackendKind, ProcessView } from "@aven/protocol/types";

const ENDED_SHOWN = 5;

function shown(processes: ProcessView[]) {
  const newest = [...processes].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const running = newest.filter((process) => process.status === "running");
  const ended = newest.filter((process) => process.status !== "running").slice(0, ENDED_SHOWN);
  return [...running, ...ended];
}

export function BackgroundTasksCard({
  threadId,
  backend,
  running,
}: {
  threadId: string;
  backend?: AgentBackendKind;
  running: boolean;
}) {
  const { processes, stopping, stop } = useThreadProcesses(threadId, running);
  const { fixing, fix } = useFixProcess(threadId, backend);
  const rows = shown(processes);
  const live = rows.filter((process) => process.status === "running");
  const ended = rows.filter((process) => process.status !== "running");
  const [chosenOpen, setChosenOpen] = useState<boolean | null>(null);
  const endedOpen = chosenOpen ?? live.length === 0;

  if (rows.length === 0) return null;

  const row = (process: ProcessView) => (
    <BackgroundProcess
      key={process.id}
      threadId={threadId}
      process={process}
      stopping={stopping.has(process.id)}
      onStop={() => void stop(process.id)}
      fixing={fixing === process.id}
      onFix={running ? undefined : () => void fix(process)}
    />
  );

  const summary =
    live.length > 0 ? (
      <span className="font-medium text-success">{live.length} running</span>
    ) : (
      `${ended.length} ended`
    );

  return (
    <OverviewCard
      title="Background tasks"
      summary={summary}
      aside={
        live.length > 0 ? (
          <span className="text-[11px] font-medium text-success tabular-nums">
            {live.length} running
          </span>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-0.5">
        {live.map(row)}
        {ended.length > 0 && (
          <Collapsible
            open={endedOpen}
            onOpenChange={setChosenOpen}
            className="flex flex-col gap-0.5"
          >
            <CollapsibleTrigger className="-mx-1.5 flex items-center gap-2 self-start rounded-md px-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase tabular-nums outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
              <span className="grid size-4 shrink-0 place-items-center">
                {endedOpen ? (
                  <IconChevronDown className="size-3" aria-hidden />
                ) : (
                  <IconChevronRight className="size-3" aria-hidden />
                )}
              </span>
              Ended ({ended.length})
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-0.5">
              {ended.map(row)}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </OverviewCard>
  );
}
