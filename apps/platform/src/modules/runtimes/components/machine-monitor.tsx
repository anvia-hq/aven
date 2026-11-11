import type { CSSProperties } from "react";

import { useRuntimes } from "../hooks/use-runtimes";
import { MachineRow } from "./machine-row";

const ROW = 32;
const GAP = 4;
const PEEK = 6;
const LAYERS = 3;

export function MachineMonitor() {
  const { runtimes } = useRuntimes({ poll: true });
  if (runtimes.length === 0) return null;
  const ordered = [...runtimes].sort(
    (a, b) => Number(b.online) - Number(a.online) || a.createdAt.localeCompare(b.createdAt),
  );
  const count = ordered.length;
  const stacked = ROW + Math.min(count - 1, LAYERS - 1) * PEEK;
  const spread = count * (ROW + GAP) - GAP;
  const stack = {
    "--stacked": `${stacked}px`,
    "--lift": `${spread - stacked}px`,
  } as CSSProperties;

  return (
    <div className="-mx-2 border-b px-2 pb-2 group-data-[collapsible=icon]:hidden md:border-b-0 md:pb-0">
      <ul
        aria-label="Machines"
        data-slot="machine-stack"
        style={stack}
        className="group/stack relative z-20 h-(--stacked)"
      >
        {ordered.map((runtime, index) => (
          <MachineRow
            key={runtime.id}
            runtime={runtime}
            style={{ "--layer": index, zIndex: count - index } as CSSProperties}
            className={
              "absolute inset-x-0 top-0 origin-top border border-sidebar-border/60 shadow-xs transition-[transform,opacity] duration-200 ease-out after:absolute after:inset-x-0 after:top-full after:h-1 motion-reduce:transition-none " +
              "translate-y-[calc(var(--layer)*6px)] scale-[calc(1-var(--layer)*0.05)] " +
              "group-focus-within/stack:translate-y-[calc(var(--layer)*36px-var(--lift))] group-focus-within/stack:scale-100 group-focus-within/stack:opacity-100 " +
              "group-hover/stack:translate-y-[calc(var(--layer)*36px-var(--lift))] group-hover/stack:scale-100 group-hover/stack:opacity-100 " +
              (index >= LAYERS
                ? "pointer-events-none opacity-0 group-focus-within/stack:pointer-events-auto group-hover/stack:pointer-events-auto"
                : "")
            }
          />
        ))}
      </ul>
    </div>
  );
}
