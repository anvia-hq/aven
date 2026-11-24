import {
  IconCheck,
  IconChecklist,
  IconChevronUp,
  IconCircle,
  IconCircleDot,
  IconLoader2,
} from "@tabler/icons-react";
import { cn } from "cn";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@aven/ui/collapsible";

import type { PlanTask } from "../types";

function TaskGlyph({ status, live }: { status: PlanTask["status"]; live: boolean }) {
  if (status === "completed") {
    return <IconCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />;
  }

  if (status === "in_progress") {
    if (live) {
      return (
        <IconLoader2
          aria-hidden
          className="mt-0.5 size-3.5 shrink-0 animate-spin text-foreground/80"
        />
      );
    }

    return <IconCircleDot aria-hidden className="mt-0.5 size-3.5 shrink-0 text-foreground/70" />;
  }

  return <IconCircle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" />;
}

export function PlanCard({ tasks, live = false }: { tasks: readonly PlanTask[]; live?: boolean }) {
  const [toggle, setToggle] = useState<{ live: boolean; open: boolean } | null>(null);

  if (tasks.length === 0) return null;

  const open = toggle && toggle.live === live ? toggle.open : live;
  const done = tasks.filter((task) => task.status === "completed").length;
  const active = tasks.find((task) => task.status === "in_progress");

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => setToggle({ live, open: next })}
      data-role="plan-card"
      className="pointer-events-auto timeline-in w-72 max-w-[calc(100cqw-2rem)] overflow-hidden rounded-xl border border-border bg-popover/95 text-popover-foreground shadow-lg ring-1 ring-foreground/5 backdrop-blur-md"
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50">
        <span className="flex min-w-0 items-center gap-1.5">
          {!open && live && active ? (
            <IconLoader2
              aria-hidden
              className="size-3.5 shrink-0 animate-spin text-foreground/80"
            />
          ) : (
            <IconChecklist aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 truncate font-medium text-foreground/90">
            {!open && active ? active.content : "Plan"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground tabular-nums">
          <span>
            {done}/{tasks.length}
          </span>
          <IconChevronUp
            aria-hidden
            className="size-3.5 transition-transform group-data-[panel-open]:rotate-180"
          />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none">
        <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto border-t border-border/60 px-3 py-2.5">
          {tasks.map((task, index) => (
            <li key={index} className="flex items-start gap-2 text-xs leading-4.5">
              <TaskGlyph status={task.status} live={live} />
              <span
                className={cn(
                  task.status === "completed" && "text-muted-foreground line-through",
                  task.status === "in_progress" && "font-medium text-foreground",
                  task.status === "pending" && "text-muted-foreground",
                )}
              >
                {task.content}
              </span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
