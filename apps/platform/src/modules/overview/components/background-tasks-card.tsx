import type { ProcessView } from "@aven/protocol/runtime-wire";

import { useThreadProcesses } from "../hooks/use-thread-processes";
import { BackgroundProcess } from "./background-process";
import { OverviewCard } from "./overview-card";

// Processes that ended stay listed, most recent first, up to this many.
const ENDED_SHOWN = 5;

// What is running first, newest first, then what ended, newest first.
function shown(processes: ProcessView[]) {
  const newest = [...processes].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const running = newest.filter((process) => process.status === "running");
  const ended = newest.filter((process) => process.status !== "running").slice(0, ENDED_SHOWN);
  return [...running, ...ended];
}

// The commands the agent has running in the thread's sandbox, or ran in the background, with a way
// to stop each (decision 0071); shown only once there is one.
export function BackgroundTasksCard({ threadId, running }: { threadId: string; running: boolean }) {
  const { processes, stopping, stop } = useThreadProcesses(threadId, running);
  const rows = shown(processes);
  // There is no card until the agent has started something: an empty one says nothing.
  // (A list that cannot be read, as while the runner is offline, is the same: nothing to show.)
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
