import { useEffect, useState } from "react";

import { elapsed } from "@/lib/format";

import { useWorkingWord } from "../hooks/use-working-word";

const STEPS = 4;
const DOTS = Array.from({ length: 9 }, (_, index) => {
  const step = Math.floor(index / 3) + (index % 3);
  return { index, step };
});

export function WorkingDots({ label }: { label?: string }) {
  return (
    <span
      className="grid shrink-0 grid-cols-3 gap-[2px]"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {DOTS.map(({ index, step }) => (
        <span
          key={index}
          className="size-[3px] rounded-full motion-safe:animate-[working-dot_1.2s_ease-in-out_infinite]"
          style={{
            backgroundColor: `color-mix(in oklch, var(--working-from), var(--working-to) ${(step / STEPS) * 100}%)`,
            animationDelay: `${step * 130}ms`,
          }}
        />
      ))}
    </span>
  );
}

function WorkingWord() {
  const { current, previous } = useWorkingWord();
  return (
    <>
      <span role="status" className="sr-only">
        Working…
      </span>
      <span className="relative inline-block min-w-[12ch]" aria-hidden>
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
  startedAt?: number | null;
};

export function WorkingIndicator({ running, startedAt = null }: Props & { running: boolean }) {
  return (
    <div className="flex h-7 items-center gap-2 px-1 text-sm text-muted-foreground">
      {running && (
        <>
          <WorkingDots />
          <WorkingWord />
          {startedAt !== null && <WorkingTime startedAt={startedAt} />}
        </>
      )}
    </div>
  );
}
