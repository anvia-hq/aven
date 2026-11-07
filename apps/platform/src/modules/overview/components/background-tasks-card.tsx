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
  const rows = shown(processes);
  if (rows.length === 0) return null;

  return (
    <OverviewCard title="Background tasks">
      {rows.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {rows.map((process) => (
            <BackgroundProcess
              key={process.id}
              threadId={threadId}
              process={process}
              stopping={stopping.has(process.id)}
              onStop={() => void stop(process.id)}
            />
          ))}
        </div>
      )}
    </OverviewCard>
  );
}
