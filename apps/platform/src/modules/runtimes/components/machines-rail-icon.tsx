import { Monitor } from "@mynaui/icons-react";
import { cn } from "cn";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@aven/ui/hover-card";
import { useRuntimes } from "../hooks/use-runtimes";
import { isSandbox } from "../sandbox";
import { MachineGauges } from "./machine-gauges";

const GAP = 12;
const RAIL_TO_SIDEBAR = 6;

export function MachinesRailIcon({ width }: { width: number }) {
  const { runtimes } = useRuntimes({ poll: true });
  const ordered = runtimes
    .filter((runtime) => !isSandbox(runtime))
    .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={150}
        closeDelay={100}
        render={
          <span
            tabIndex={0}
            role="img"
            aria-label="Machines"
            className="flex size-9 shrink-0 cursor-default items-center justify-center rounded-xl text-muted-foreground outline-none transition-colors duration-200 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          />
        }
      >
        <Monitor className="size-[17px]" />
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="end"
        alignOffset={0}
        sideOffset={GAP + RAIL_TO_SIDEBAR}
        style={{ width: width - 2 * GAP }}
        className="overflow-hidden rounded-3xl p-0 shadow-xl"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-mono text-xs tracking-widest text-foreground uppercase">
            Machines
          </span>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {ordered.length}
          </span>
        </div>
        {ordered.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">No machines registered.</p>
        ) : (
          <ul
            aria-label="Registered machines"
            className="flex max-h-[60vh] flex-col divide-y overflow-y-auto"
          >
            {ordered.map((runtime) => (
              <li key={runtime.id} aria-label={runtime.name} className="px-4 py-3.5">
                <div className="flex items-center gap-2.5">
                  <span
                    role="img"
                    aria-label={runtime.online ? "Online" : "Offline"}
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      runtime.online
                        ? "bg-success shadow-[0_0_8px_var(--success)]"
                        : "bg-muted-foreground/40",
                    )}
                  />
                  <p
                    className={cn(
                      "min-w-0 flex-1 truncate font-mono text-sm tracking-wide uppercase",
                      !runtime.online && "text-muted-foreground",
                    )}
                  >
                    {runtime.name}
                  </p>
                  {!runtime.online && (
                    <span className="shrink-0 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                      Offline
                    </span>
                  )}
                  {runtime.isControlPlane && (
                    <span className="shrink-0 rounded-md bg-accent px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-accent-foreground uppercase">
                      Server
                    </span>
                  )}
                </div>
                <MachineGauges runtime={runtime} />
              </li>
            ))}
          </ul>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
