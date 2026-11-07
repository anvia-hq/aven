export const TASK_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PREFIX = "T";

export const TAG_PATTERN = /^[a-z0-9][a-z0-9_/-]{0,31}$/;
export const TAG_RULE =
  "A tag is up to 32 lowercase letters, digits, '-', '_' or '/', starting with a letter or digit";
export const TAGS_MAX = 10;

export const COCKPIT_TITLE_MAX = 200;
export const COCKPIT_BODY_MAX = 200_000;
export const COCKPIT_ITEMS_MAX = 2000;

export function normalizeTag(tag: string) {
  return tag.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-");
}

export type InboxItem = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  done: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CockpitTask = {
  id: string;
  number: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  tags: string[];
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

export const TAG_COLOR = /^#[0-9a-f]{6}$/;

export const TAGS_DEFINED_MAX = 200;

export type CockpitTag = {
  name: string;
  color: string | null;
  inbox: number;
  tasks: number;
  notes: number;
};

export const COCKPIT_KINDS = ["inbox", "tasks", "notes"] as const;
export type CockpitKind = (typeof COCKPIT_KINDS)[number];

export type CockpitAccess = "read" | "write";

export type CockpitFields = {
  title?: string;
  body?: string;
  tags?: string[];
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  done?: boolean;
  pinned?: boolean;
};

export type CockpitCommand =
  | {
      command: "list";
      kind: CockpitKind;
      tag?: string;
      query?: string;
      status?: TaskStatus;
      done?: boolean;
    }
  | { command: "get"; kind: CockpitKind; id: string }
  | { command: "tags" }
  | { command: "create"; kind: CockpitKind; fields: CockpitFields & { title: string } }
  | { command: "update"; kind: CockpitKind; id: string; fields: CockpitFields }
  | { command: "delete"; kind: CockpitKind; id: string };

export const COCKPIT_WRITES = ["create", "update", "delete"] as const;
