import { useEffect, useState } from "react";

import { elapsed } from "@/lib/format";
import { threadComputer } from "@/modules/computer/computer";
import { useComputerStatus } from "@/modules/computer/hooks/use-computer-status";
import { ProjectTile } from "@/modules/projects/components/project-tile";
import { useProjectPalettes } from "@/modules/projects/hooks/use-project-palettes";
import { useRuntime } from "@/modules/runtimes/hooks/use-runtime";
import { isSandbox } from "@/modules/runtimes/sandbox";

import { useWorkingWord } from "../hooks/use-working-word";

function WorkingWord() {
  const { current, previous } = useWorkingWord();
  return (
    <>
      <span role="status" className="sr-only">
        Working…
      </span>
      <span className="relative inline-block" aria-hidden>
        {previous && (
          <span
            key={`out-${previous}`}
            className="absolute top-0 left-0 whitespace-nowrap motion-safe:animate-[word-out_450ms_ease-in_forwards] motion-reduce:hidden"
          >
            {previous}…
          </span>
        )}
        <span
          key={current}
          className="inline-block whitespace-nowrap motion-safe:animate-[word-in_450ms_ease-out_both]"
        >
          {current}…
        </span>
      </span>
    </>
  );
}

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
  startedAt?: number | null;
};

export function WorkingIndicator({
  running,
  threadId,
  runtimeId,
  projectId,
  startedAt = null,
}: Props & { running: boolean }) {
  const palettes = useProjectPalettes();
  const { runtime } = useRuntime(runtimeId);
  const sandbox = isSandbox(runtime);
  const { status } = useComputerStatus(threadComputer(threadId));
  const creating = sandbox && status?.available === true && status.state !== "awake";

  if (!running && !creating) return null;

  return (
    <div className="flex flex-col gap-1">
      {creating && (
        <p className="flex h-7 items-center px-1 text-sm text-muted-foreground">
          <span className="shimmer">
            {status.state === "waking" ? "Creating sandbox" : "Starting sandbox"}
          </span>
        </p>
      )}
      {running && (
        <div
          data-role="working"
          className="flex h-7 min-w-0 items-center gap-2 px-1 text-sm whitespace-nowrap text-muted-foreground"
        >
          <ProjectTile
            projectId={projectId}
            palette={palettes.get(projectId)}
            speed={2}
            working
            decorative
          />
          <WorkingWord />
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
