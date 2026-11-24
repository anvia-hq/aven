import { IconCheck, IconCircle, IconLoader2 } from "@tabler/icons-react";
import { cn } from "cn";

import type { PlanTask } from "../types";

function TaskGlyph({ status, live }: { status: PlanTask["status"]; live: boolean }) {
  if (status === "completed") {
    return <IconCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />;
  }

  if (status === "in_progress") {
    return (
      <IconLoader2
        aria-hidden
        className={cn("mt-0.5 size-3.5 shrink-0 text-meter", live && "animate-spin")}
      />
    );
  }

  return <IconCircle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" />;
}

export function PlanCard({ tasks, live = false }: { tasks: readonly PlanTask[]; live?: boolean }) {
  if (tasks.length === 0) return null;

  const done = tasks.filter((task) => task.status === "completed").length;

  return (
    <div
      data-role="plan-card"
      className="rounded-xl border border-border/70 bg-muted/25 px-3.5 py-2.5 text-sm"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/85">Plan</span>
        <span className="tabular-nums">
          {done}/{tasks.length} done
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {tasks.map((task, index) => (
          <li key={index} className="flex items-start gap-2 text-xs leading-5">
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
    </div>
  );
}
