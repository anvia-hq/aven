import { Monitor } from "@mynaui/icons-react";
import { cn } from "cn";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@aven/ui/hover-card";
import { useRuntimes } from "../hooks/use-runtimes";
import { MachineLoad } from "./machine-load";

export function MachinesRailIcon({ width }: { width: number }) {
  const { runtimes } = useRuntimes({ poll: true });
  const ordered = [...runtimes].sort(
    (a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name),
  );
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
      <HoverCardContent side="right" align="end" sideOffset={6} style={{ width }} className="p-0">
        <div className="border-b px-3 py-2 text-xs text-muted-foreground">
          {ordered.length === 1 ? "1 machine" : `${ordered.length} machines`}
        </div>
        {ordered.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">No machines registered.</p>
        ) : (
          <ul aria-label="Registered machines" className="flex max-h-80 flex-col overflow-y-auto">
            {ordered.map((runtime) => (
              <li
                key={runtime.id}
                aria-label={runtime.name}
                className="flex items-start gap-2.5 px-3 py-2.5"
              >
                <span
                  role="img"
                  aria-label={runtime.online ? "Online" : "Offline"}
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    runtime.online ? "bg-success" : "bg-muted-foreground/40",
                  )}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate text-sm">{runtime.name}</p>
                  <MachineLoad runtime={runtime} />
                </div>
                {runtime.isControlPlane && (
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    Server
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
