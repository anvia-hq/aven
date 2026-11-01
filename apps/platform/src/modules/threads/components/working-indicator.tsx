import { useEffect, useState } from "react";

import { elapsed } from "@/lib/format";

import { useWorkingWord } from "../hooks/use-working-word";

// Three rows of three dots whose color runs from pale blue (top left) to rose (bottom right), and
// whose pulse crosses the grid diagonally, one step after another. The colors are the
// `--working-from` and `--working-to` tokens of index.css.
const STEPS = 4;
const DOTS = Array.from({ length: 9 }, (_, index) => {
  const step = Math.floor(index / 3) + (index % 3);
  return { index, step };
});

function Dots() {
  return (
    <span className="grid grid-cols-3 gap-[2px]" aria-hidden>
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

// A word that changes now and then, blurring out as the next one blurs in. A screen reader is
// told once that the agent is working, not every time the word changes.
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

// How long the run has gone on, counted from `startedAt` once a second.
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
  /** When the run started (`Date.now()`); without it only the dots and the word are shown. */
  startedAt?: number | null;
};

// Sits under the conversation while the agent works, whether it is writing, running a tool or
// waiting for the model's first token. It is sticky at the offset the end of the conversation has
// (the list's bottom padding), so while the text above grows and the scroll follows a frame behind,
// it stays put in the viewport instead of bouncing with each delta.
export function WorkingIndicator({ startedAt = null }: Props) {
  return (
    <div className="sticky bottom-48 z-10 flex items-center gap-2 bg-background text-sm text-muted-foreground">
      <Dots />
      <WorkingWord />
      {startedAt !== null && <WorkingTime startedAt={startedAt} />}
    </div>
  );
}
