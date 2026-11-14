import { useEffect, useState } from "react";

import { elapsed } from "@/lib/format";
import { ProjectTile } from "@/modules/projects/components/project-tile";
import { useProjectPalettes } from "@/modules/projects/hooks/use-project-palettes";

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
  projectId: string;
  startedAt?: number | null;
};

export function WorkingIndicator({
  running,
  projectId,
  startedAt = null,
}: Props & { running: boolean }) {
  const palettes = useProjectPalettes();

  if (!running) return null;

  return (
    <div
      data-role="working"
      className="flex h-7 min-w-0 items-center gap-2 px-1 text-sm whitespace-nowrap text-muted-foreground"
    >
      <ProjectTile projectId={projectId} palette={palettes.get(projectId)} speed={2} working />
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
