import { useEffect, useState } from "react";

import { elapsed } from "@/lib/format";
import { threadComputer } from "@/modules/computer/computer";
import { useComputerStatus } from "@/modules/computer/hooks/use-computer-status";
import { useProjectPalettes } from "@/modules/projects/hooks/use-project-palettes";
import { useRuntime } from "@/modules/runtimes/hooks/use-runtime";
import { isSandbox } from "@/modules/runtimes/sandbox";

import type { LiveStep } from "../types";
import { ThreadMark } from "./thread-mark";

function WorkingTime({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return <span className="tabular-nums">{elapsed(now - startedAt)}</span>;
}

type Props = {
  threadId: string;
  runtimeId: string;
  projectId: string;
  color?: string | null;
  startedAt?: number | null;
  liveStep?: LiveStep | null;
};

export function WorkingIndicator({
  running,
  threadId,
  runtimeId,
  projectId,
  color,
  startedAt = null,
  liveStep = null,
}: Props & { running: boolean }) {
  const palettes = useProjectPalettes();
  const { runtime } = useRuntime(runtimeId);
  const sandbox = isSandbox(runtime);
  const { status } = useComputerStatus(threadComputer(threadId));
  const creating = sandbox && status?.available === true && status.state !== "awake";

  if (!running && !creating) return null;

  const label = liveStep ? liveStep.label : "Working";

  return (
    <div className="flex flex-col gap-1">
      {creating && (
        <p className="indicator-in flex h-7 items-center px-1 text-sm text-muted-foreground">
          <span className="shimmer">
            {status.state === "waking" ? "Creating sandbox" : "Starting sandbox"}
          </span>
        </p>
      )}
      {running && (
        <div
          data-role="working"
          className="indicator-in flex h-7 min-w-0 items-center gap-2 px-1 text-sm whitespace-nowrap text-muted-foreground"
        >
          <ThreadMark
            projectId={projectId}
            runtimeId={runtimeId}
            palette={palettes.get(projectId)}
            color={color}
            speed={2}
            working
            decorative
          />
          <span role="status" className="min-w-0 truncate shimmer">
            {label}…
          </span>
          {startedAt !== null && (
            <>
              <span aria-hidden>·</span>
              <WorkingTime startedAt={startedAt} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
