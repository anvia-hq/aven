import { ChevronDown, ChevronRight } from "@mynaui/icons-react";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/collapsible";

import { useFixProcess } from "../hooks/use-fix-process";
import { useThreadProcesses } from "../hooks/use-thread-processes";
import { BackgroundProcess } from "./background-process";
import { OverviewCard } from "./overview-card";
import type { ProcessView } from "@aven/protocol/types";

const ENDED_SHOWN = 5;

function shown(processes: ProcessView[]) {
  const newest = [...processes].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const running = newest.filter((process) => process.status === "running");
  const ended = newest.filter((process) => process.status !== "running").slice(0, ENDED_SHOWN);
  return [...running, ...ended];
}

export function BackgroundTasksCard({ threadId, running }: { threadId: string; running: boolean }) {
  const { processes, stopping, stop } = useThreadProcesses(threadId, running);
  const { fixing, fix } = useFixProcess(threadId);
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

  return (
    <OverviewCard
      title="Background tasks"
      aside={
        live.length > 0 ? (
          <span className="text-[10px] font-medium text-success">{live.length} running</span>
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
            <CollapsibleTrigger className="-mx-1.5 flex items-center gap-2 self-start rounded-md px-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase outline-none hover:text-foreground focus-visible:underline">
              <span className="grid size-4 shrink-0 place-items-center">
                {endedOpen ? (
                  <ChevronDown className="size-3" aria-hidden />
                ) : (
                  <ChevronRight className="size-3" aria-hidden />
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
