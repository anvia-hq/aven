import { CalendarCheck, Flag } from "@mynaui/icons-react";

import { cn } from "cn";

import type { CockpitTask, TaskPriority, TaskStatus } from "../types";
import {
  isOverdue,
  PRIORITY_LABELS,
  PRIORITY_TONE,
  shortDay,
  STATUS_DOT,
  STATUS_LABELS,
} from "./task-fields";

// A status as a small ring, filled as the work goes on.
export function StatusDot({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span
      role="img"
      aria-label={STATUS_LABELS[status]}
      className={cn(
        "inline-block size-3 shrink-0 rounded-full border-[1.5px]",
        STATUS_DOT[status],
        className,
      )}
    />
  );
}

// A priority as a flag in its colour; none is a faint one.
export function PriorityFlag({ priority }: { priority: TaskPriority }) {
  return (
    <Flag
      role="img"
      aria-label={PRIORITY_LABELS[priority]}
      className={cn("size-3.5 shrink-0", PRIORITY_TONE[priority])}
    />
  );
}

// When a task is due, red once the day has passed and it is not finished.
export function DueDate({ task }: { task: Pick<CockpitTask, "dueDate" | "status"> }) {
  if (!task.dueDate) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        isOverdue(task.dueDate, task.status) ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <CalendarCheck className="size-3.5" />
      {shortDay(task.dueDate)}
    </span>
  );
}
