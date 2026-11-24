import { useEffect, useState } from "react";

import { elapsed } from "@/lib/format";
import { useProjectPalettes } from "@/modules/projects/hooks/use-project-palettes";

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
  runtimeId: string;
  projectId: string;
  color?: string | null;
  startedAt?: number | null;
  liveStep?: LiveStep | null;
};

export function WorkingIndicator({
  running,
  runtimeId,
  projectId,
  color,
  startedAt = null,
  liveStep = null,
}: Props & { running: boolean }) {
  const palettes = useProjectPalettes();

  if (!running) return null;

  const label = liveStep ? liveStep.label : "Working";

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
  );
}
