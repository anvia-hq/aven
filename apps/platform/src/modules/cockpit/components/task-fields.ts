import { TASK_PRIORITIES, TASK_STATUSES } from "@aven/protocol/cockpit";

import type { TaskPriority, TaskStatus } from "../types";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
  cancelled: "Cancelled",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
};

/** The colour of a status's dot, from the theme's tokens. */
export const STATUS_DOT: Record<TaskStatus, string> = {
  backlog: "border-muted-foreground/50 border-dashed",
  todo: "border-muted-foreground",
  in_progress: "border-meter bg-meter/30",
  in_review: "border-primary bg-primary/30",
  done: "border-primary bg-primary",
  cancelled: "border-muted-foreground/50 bg-muted-foreground/30",
};

export const PRIORITY_TONE: Record<TaskPriority, string> = {
  urgent: "text-destructive",
  high: "text-meter",
  medium: "text-foreground",
  low: "text-muted-foreground",
  none: "text-muted-foreground/60",
};

export const STATUSES = TASK_STATUSES;
export const PRIORITIES = TASK_PRIORITIES;

/** A task's identifier, as it is shown. */
export const taskKey = (task: { number: number }) => `T-${task.number}`;

/** Whether a day (`YYYY-MM-DD`) is before today, for a task not finished by it. */
export function isOverdue(dueDate: string | null, status: TaskStatus) {
  if (!dueDate || status === "done" || status === "cancelled") return false;
  return dueDate < new Date().toLocaleDateString("en-CA");
}

/** A day as a short date: "Nov 30". */
export function shortDay(day: string) {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
