// An agent's memory (decision 0102): short notes that outlive a thread or a bot's chat, one fact a
// note, kept by the control plane and seen by the agent as files in `/memories/<scope>/`.

/** Where the agent sees its notes. */
export const MEMORY_ROOT = "/memories";

/**
 * Whose notes a folder holds: `personal` the person's in every project and bot, `project` the
 * person's in one project (a thread's agent), `bot` one bot's.
 */
export const MEMORY_SCOPES = ["personal", "project", "bot"] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

/** What a note's name looks like: no folders, so a path is a scope and a name. */
export const MEMORY_NOTE_NAME = /^[a-z0-9][a-z0-9._-]{0,78}\.md$/;
export const MEMORY_NOTE_NAME_RULE =
  "Use lowercase letters, digits, '.', '_' and '-', ending in .md (at most 80 characters)";

/** The most a note holds, in characters. */
export const MEMORY_NOTE_MAX = 8000;

/** The most notes a scope holds. */
export const MEMORY_NOTES_PER_SCOPE = 200;

/** The most notes of a folder the agent's instructions list: the latest; it views the folder for the rest. */
export const MEMORY_INDEXED_PER_SCOPE = 40;

/** The kinds of note, as the frontmatter's `type` says. */
export const MEMORY_TYPES = ["user", "feedback", "project", "reference"] as const;

/** How long a note's description may be in the index. */
export const MEMORY_DESCRIPTION_MAX = 200;

/**
 * What the agent asks of its memory, as Anthropic's memory tool has it. A path is `/memories`, a
 * folder (`/memories/project`) or a note in one (`/memories/project/staging.md`).
 */
export type MemoryCommand =
  | { command: "view"; path: string; viewRange?: [number, number] }
  | { command: "create"; path: string; fileText: string }
  | { command: "str_replace"; path: string; oldStr: string; newStr: string }
  | { command: "insert"; path: string; insertLine: number; insertText: string }
  | { command: "delete"; path: string }
  | { command: "rename"; oldPath: string; newPath: string };

/** The commands that change a note. */
export const MEMORY_WRITES = ["create", "str_replace", "insert", "delete", "rename"] as const;

/** A note as the index lists it. */
export type MemoryListing = { name: string; description: string };

/** A folder the agent has, with its notes, which its instructions list (`memory` on a run or a reply). */
export type MemoryFolder = {
  scope: MemoryScope;
  notes: MemoryListing[];
  /** Notes of the folder left out of the list, which `view` of the folder shows. */
  more?: number;
};

/** What a run or a reply carries of memory: its folders, and whether it may change them. */
export type RunMemory = { folders: MemoryFolder[]; writable: boolean };

/** A note as the platform shows it. */
export type MemoryNoteView = {
  id: string;
  scope: MemoryScope;
  /** The project or bot the note is for, by scope. */
  projectId: string | null;
  botId: string | null;
  name: string;
  description: string;
  body: string;
  updatedAt: string;
};

/** Who changed a note: the person, a thread's agent, or a bot. */
export type MemorySource = "person" | "thread" | "bot";

/** A change to a note, as the history shows it: never its body. */
export type MemoryEventView = {
  id: string;
  scope: MemoryScope;
  projectId: string | null;
  botId: string | null;
  name: string;
  action: "created" | "updated" | "removed" | "renamed";
  /** The name it had, for a note renamed. */
  from: string | null;
  source: MemorySource;
  threadId: string | null;
  at: string;
};

// The frontmatter at a note's top, between `---` lines.
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * What the index says of a note: its frontmatter's `description`, or else its first line of text,
 * on one line and cut short.
 */
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
