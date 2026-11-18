import { cn } from "cn";

const RINGS = [
  { turn: "rotate-0", speed: "[animation-duration:9s]" },
  { turn: "rotate-60", speed: "[animation-duration:13s]" },
  { turn: "rotate-120", speed: "[animation-duration:11s] [animation-direction:reverse]" },
];

function Medallion() {
  return (
    <div
      aria-hidden
      className="absolute -top-7 right-4 size-14 rounded-full border border-effort/40 bg-background shadow-lg perspective-[240px]"
    >
      {RINGS.map((ring) => (
        <span
          key={ring.turn}
          className={cn(
            "ring-turn absolute inset-2 rounded-full border border-effort/80",
            ring.turn,
            ring.speed,
          )}
        />
      ))}
      <span className="absolute inset-[1.35rem] rounded-full bg-effort/70 blur-[3px]" />
    </div>
  );
}

export function BetaBadge() {
  return (
    <div
      role="note"
      className="pointer-events-none fixed right-2.5 bottom-2.5 z-40 hidden w-72 rounded-2xl border border-effort/35 bg-card bg-[radial-gradient(120%_140%_at_0%_0%,color-mix(in_oklch,var(--info)_30%,transparent),transparent_62%),radial-gradient(110%_130%_at_100%_100%,color-mix(in_oklch,var(--effort)_26%,transparent),transparent_60%)] p-4 pr-5 shadow-xl md:block"
    >
      <Medallion />
      <p className="text-[0.7rem] font-medium tracking-[0.18em] text-effort uppercase">Beta</p>
      <p className="mt-1 text-sm font-semibold text-foreground">You are early</p>
      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
        Aven is in beta. Expect rough edges, and tell us what breaks.
      </p>
    </div>
  );
}
