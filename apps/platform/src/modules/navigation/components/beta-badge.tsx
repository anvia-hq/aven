import { cn } from "cn";

const WAVE = "M0 10 Q12.5 0 25 10 T50 10 T75 10 T100 10 T125 10 T150 10 T175 10 T200 10 V20 H0 Z";

function Wave({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 20"
      preserveAspectRatio="none"
      className={cn("wave-drift absolute bottom-0 left-0 w-[200%] fill-foreground", className)}
    >
      <path d={WAVE} />
    </svg>
  );
}

const EMBER = "color-mix(in oklch, var(--meter) 48%, var(--background))";
const MIST =
  "color-mix(in oklch, color-mix(in oklch, var(--meter), var(--info)) 38%, var(--background))";
const SKY = "color-mix(in oklch, var(--info) 48%, var(--background))";
const FLOW = `linear-gradient(115deg, ${EMBER}, ${MIST}, ${SKY}, ${MIST}, ${EMBER})`;

export function BetaBadge() {
  return (
    <div
      role="note"
      className="pointer-events-none fixed right-6 bottom-6 z-40 hidden w-66 overflow-hidden rounded-2xl bg-card px-5 py-4 shadow-2xl ring-1 ring-foreground/12 md:block"
    >
      <div
        aria-hidden
        style={{ backgroundImage: FLOW }}
        className="gradient-flow absolute inset-0 bg-size-[200%_100%]"
      />
      <Wave className="h-3/4 opacity-[0.16] blur-[6px] [animation-duration:11s]" />
      <Wave className="h-1/2 opacity-[0.12] blur-[4px] [animation-direction:reverse] [animation-duration:7s]" />
      <div
        aria-hidden
        className="absolute inset-0 rounded-2xl shadow-[inset_0_1px_0_color-mix(in_oklch,var(--foreground)_22%,transparent)]"
      />
      <div className="relative flex flex-col gap-1 leading-tight text-foreground">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span
            aria-hidden
            className="size-1.5 rounded-full bg-meter shadow-[0_0_8px_var(--meter)]"
          />
          Beta version
        </span>
        <span className="text-xs leading-5 text-foreground/70">
          Aven is still in beta, so expect a few rough edges. If something breaks, let us know.
        </span>
      </div>
    </div>
  );
}
