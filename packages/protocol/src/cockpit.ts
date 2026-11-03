// The person's cockpit (decision 0104): an inbox to capture things, tasks to work on and notes to
// keep, each with tags. Plain records the person keeps; no agent acts on them.

/** Where a task is, in the board's order. */
export const TASK_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** How urgent a task is, most first; `none` is unset. */
export const TASK_PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** What a task's identifier starts with: `T-12`. */
export const TASK_PREFIX = "T";

/** A tag is lowercase words: letters, digits, `-`, `_` and `/` (for `area/sub`). */
export const TAG_PATTERN = /^[a-z0-9][a-z0-9_/-]{0,31}$/;
export const TAG_RULE =
  "A tag is up to 32 lowercase letters, digits, '-', '_' or '/', starting with a letter or digit";
export const TAGS_MAX = 10;

export const COCKPIT_TITLE_MAX = 200;
/** A body is BlockNote's blocks as JSON (decision 0105), which takes more room than the words. */
export const COCKPIT_BODY_MAX = 200_000;
/** The most items of one kind a person keeps. */
export const COCKPIT_ITEMS_MAX = 2000;

/** A tag as a person types it, made into one: trimmed, lowercase, spaces as dashes. */
export function normalizeTag(tag: string) {
  return tag.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-");
}

export type InboxItem = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  /** Dealt with: kept, but out of the open list. */
  done: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CockpitTask = {
  id: string;
  /** Its number among the person's tasks, shown as `T-<number>`. */
  number: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** A day, `YYYY-MM-DD`, or null. */
  dueDate: string | null;
  tags: string[];
  /** Its place in its status's column: lower first. */
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type CockpitNote = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

/** A tag's color: a hex color as `#rrggbb`, which the platform offers from the bots' palette. */
export const TAG_COLOR = /^#[0-9a-f]{6}$/;

/** The most tags a person defines (adds before using, or gives a color). */
export const TAGS_DEFINED_MAX = 200;

/**
 * A tag the person uses or defined, with how many of each kind carry it and the color they chose,
 * or null for the one its name picks (decision 0107).
 */
export type CockpitTag = {
  name: string;
  color: string | null;
  inbox: number;
  tasks: number;
  notes: number;
};
