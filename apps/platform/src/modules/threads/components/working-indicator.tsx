import { cn } from "cn";
import { useEffect, useState } from "react";

import { elapsed } from "@/lib/format";
import { useProjectPalettes } from "@/modules/projects/hooks/use-project-palettes";

import { useWorkingWord } from "../hooks/use-working-word";
import { ThreadMark } from "./thread-mark";

function WorkingWord() {
  const { current, previous } = useWorkingWord();
  return (
    <>
      <span role="status" className="sr-only">
        Working…
      </span>
      <span data-role="working-label" className="relative inline-block" aria-hidden>
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
          className={cn(
            "inline-block whitespace-nowrap",
            previous && "motion-safe:animate-[word-in_450ms_ease-out_both]",
          )}
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
  runtimeId: string;
  projectId: string;
  color?: string | null;
  startedAt?: number | null;
};

export function WorkingIndicator({
  running,
  runtimeId,
  projectId,
  color,
  startedAt = null,
}: Props & { running: boolean }) {
  const palettes = useProjectPalettes();

  if (!running) return null;

  return (
    <div
      data-role="working"
      className="indicator-in flex h-7 min-w-0 items-center gap-2 text-sm whitespace-nowrap text-muted-foreground"
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        <ThreadMark
          projectId={projectId}
          runtimeId={runtimeId}
          palette={palettes.get(projectId)}
          color={color}
          speed={2}
          working
          decorative
        />
      </span>
      <WorkingWord />
      {startedAt !== null && (
        <>
          <span aria-hidden>·</span>
          <WorkingTime startedAt={startedAt} />
        </>
      )}
    </div>
  );
}
