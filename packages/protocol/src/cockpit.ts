export const TASK_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "cancelled",
] as const;
export const TASK_PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;
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

export const TAG_COLOR = /^#[0-9a-f]{6}$/;

export const TAGS_DEFINED_MAX = 200;

export const COCKPIT_KINDS = ["inbox", "tasks", "notes"] as const;
export const COCKPIT_WRITES = ["create", "update", "delete", "convert"] as const;
