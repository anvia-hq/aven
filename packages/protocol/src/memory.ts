export const MEMORY_ROOT = "/memories";

export const MEMORY_SCOPES = ["personal", "project", "bot"] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export const MEMORY_NOTE_NAME = /^[a-z0-9][a-z0-9._-]{0,78}\.md$/;
export const MEMORY_NOTE_NAME_RULE =
  "Use lowercase letters, digits, '.', '_' and '-', ending in .md (at most 80 characters)";

export const MEMORY_NOTE_MAX = 8000;

export const MEMORY_NOTES_PER_SCOPE = 200;

export const MEMORY_INDEXED_PER_SCOPE = 40;

export const MEMORY_TYPES = ["user", "feedback", "project", "reference"] as const;

export const MEMORY_DESCRIPTION_MAX = 200;

export type MemoryCommand =
  | { command: "view"; path: string; viewRange?: [number, number] }
  | { command: "create"; path: string; fileText: string }
  | { command: "str_replace"; path: string; oldStr: string; newStr: string }
  | { command: "insert"; path: string; insertLine: number; insertText: string }
  | { command: "delete"; path: string }
  | { command: "rename"; oldPath: string; newPath: string };

export const MEMORY_WRITES = ["create", "str_replace", "insert", "delete", "rename"] as const;

export type MemoryListing = { name: string; description: string };

export type MemoryFolder = {
  scope: MemoryScope;
  notes: MemoryListing[];
  more?: number;
};

export type RunMemory = { folders: MemoryFolder[]; writable: boolean };

export type MemoryNoteView = {
  id: string;
  scope: MemoryScope;
  projectId: string | null;
  botId: string | null;
  name: string;
  description: string;
  body: string;
  updatedAt: string;
};

export type MemorySource = "person" | "thread" | "bot";

export type MemoryEventView = {
  id: string;
  scope: MemoryScope;
  projectId: string | null;
  botId: string | null;
  name: string;
  action: "created" | "updated" | "removed" | "renamed";
  from: string | null;
  source: MemorySource;
  threadId: string | null;
  at: string;
};

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function noteDescription(body: string) {
  const front = FRONTMATTER.exec(body);
  const described = front?.[1]
    ?.split(/\r?\n/)
    .map((line) => /^description:\s*(.*)$/.exec(line.trim())?.[1])
    .find((value) => value !== undefined);
  const rest = front ? body.slice(front[0].length) : body;
  const firstLine = rest
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  const text = (described?.replace(/^["']|["']$/g, "") || firstLine || "").replace(/\s+/g, " ");
  return text.length > MEMORY_DESCRIPTION_MAX
    ? `${text.slice(0, MEMORY_DESCRIPTION_MAX - 1)}…`
    : text;
}
