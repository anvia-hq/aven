export const MEMORY_ROOT = "/memories";

export const MEMORY_SCOPES = ["personal", "project", "bot"] as const;
export const MEMORY_NOTE_NAME = /^[a-z0-9][a-z0-9._-]{0,78}\.md$/;
export const MEMORY_NOTE_NAME_RULE =
  "Use lowercase letters, digits, '.', '_' and '-', ending in .md (at most 80 characters)";

export const MEMORY_NOTE_MAX = 8000;

export const MEMORY_NOTES_PER_SCOPE = 200;

export const MEMORY_INDEXED_PER_SCOPE = 40;

export const MEMORY_TYPES = ["user", "feedback", "project", "reference"] as const;

export const MEMORY_DESCRIPTION_MAX = 200;

export const MEMORY_WRITES = ["create", "str_replace", "insert", "delete", "rename"] as const;

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
