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

export function BetaBadge() {
  return (
    <div
      role="note"
      className="pointer-events-none fixed right-6 bottom-6 z-40 hidden w-66 overflow-hidden rounded-2xl px-5 py-3.5 shadow-xl ring-1 ring-foreground/10 md:block"
    >
      <div
        aria-hidden
        className="gradient-flow absolute inset-0 bg-[linear-gradient(115deg,var(--meter),color-mix(in_oklch,var(--meter),var(--info)_50%),var(--info),color-mix(in_oklch,var(--meter),var(--info)_50%),var(--meter))] bg-size-[200%_100%]"
      />
      <Wave className="h-3/4 opacity-[0.14] [animation-duration:11s]" />
      <Wave className="h-1/2 opacity-[0.12] [animation-direction:reverse] [animation-duration:7s]" />
      <div className="relative flex flex-col gap-0.5 leading-tight text-primary-foreground">
        <span className="text-sm font-semibold">Beta version</span>
        <span className="text-xs leading-5 opacity-80">
          Aven is still in beta, so expect a few rough edges. If something breaks, let us know.
        </span>
      </div>
    </div>
  );
}
