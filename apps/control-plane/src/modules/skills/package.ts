import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { MAX_SKILL_NAME, SKILL_NAME, readSkillFolder } from "@aven/agents/skills";

import { UnprocessableError } from "../../errors";
import { MAX_SKILL_BYTES, MAX_SKILL_FILES } from "./schema";

export class InvalidSkillError extends UnprocessableError {}

/** A skill's files by their path in its folder. */
export type SkillFiles = Map<string, Uint8Array>;

/** A skill ready to store or send: its folder as a `.tar.gz`, named by what is in it. */
export type PackedSkill = {
  name: string;
  description: string;
  archive: Uint8Array;
  digest: string;
  size: number;
  fileCount: number;
};

// What an archiver or a desktop adds that is not part of the skill.
const JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)(\/|$)/;

// A path inside the folder, with `/` between its parts; undefined for one that would leave it.
function safePath(path: string) {
  const parts = path.replaceAll("\\", "/").split("/");
  if (parts[0] === "") return undefined;
  const kept = parts.filter((part) => part !== ".");
  if (kept.some((part) => part === "" || part === "..")) return undefined;
  return kept.join("/");
}

/**
 * The files of an upload as one skill's folder. A folder the browser read, or a zip of one, has
 * the skill in a folder of its own; that folder is taken away, so SKILL.md is at the top.
 */
export function skillFolder(uploaded: readonly { path: string; data: string }[]): SkillFiles {
  const files: SkillFiles = new Map();
  for (const file of uploaded) {
    const path = safePath(file.path);
    if (!path) throw new InvalidSkillError(`"${file.path}" is not a path inside the skill`);
    if (JUNK.test(path)) continue;
    files.set(path, Uint8Array.fromBase64(file.data));
  }
  const paths = [...files.keys()];
  const top = paths[0]?.split("/")[0];
  const nested = !files.has("SKILL.md") && top && paths.every((path) => path.startsWith(`${top}/`));
  const folder = nested
    ? new Map([...files].map(([path, bytes]) => [path.slice(top.length + 1), bytes]))
    : files;
  if (!folder.has("SKILL.md")) throw new InvalidSkillError("A skill needs a SKILL.md at its top");
  if (folder.size > MAX_SKILL_FILES)
    throw new InvalidSkillError(`A skill can have at most ${MAX_SKILL_FILES} files`);
  const size = [...folder.values()].reduce((sum, bytes) => sum + bytes.length, 0);
  if (size > MAX_SKILL_BYTES)
    throw new InvalidSkillError(`A skill can be at most ${MAX_SKILL_BYTES / 1024 / 1024} MB`);
  return folder;
}

// The name a SKILL.md gives its skill, which is also the folder Anvia expects it in.
function declaredName(files: SkillFiles) {
  const text = new TextDecoder().decode(files.get("SKILL.md"));
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text)?.[1];
  if (frontmatter === undefined)
    throw new InvalidSkillError("SKILL.md must start with frontmatter");
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(frontmatter);
  } catch {
    throw new InvalidSkillError("The frontmatter of SKILL.md is not valid YAML");
  }
  const name = (parsed as { name?: unknown } | null)?.name;
  if (typeof name !== "string" || !SKILL_NAME.test(name) || name.length > MAX_SKILL_NAME)
    throw new InvalidSkillError(
      `The skill's name must be lowercase letters, numbers and hyphens, at most ${MAX_SKILL_NAME} characters`,
    );
  return name;
}

// Named by the files, not the archive's bytes, so the same folder packed twice is the same skill.
function digestOf(files: SkillFiles) {
  const hasher = new Bun.CryptoHasher("sha256");
  for (const path of [...files.keys()].sort()) {
    const bytes = files.get(path) ?? new Uint8Array();
    hasher.update(`${path}\0${bytes.length}\0`);
    hasher.update(bytes);
  }
  return hasher.digest("hex");
}

async function pack(files: SkillFiles) {
  return new Bun.Archive(Object.fromEntries(files), { compress: "gzip" }).bytes();
}

/** Checks a skill's folder as Anvia reads it, and packs it. Throws InvalidSkillError with why not. */
export async function packSkill(files: SkillFiles): Promise<PackedSkill> {
  const name = declaredName(files);
  const scratch = await mkdtemp(join(tmpdir(), "aven-skill-"));
  try {
    const dir = join(scratch, name);
    for (const [path, bytes] of files) {
      await mkdir(dirname(join(dir, path)), { recursive: true });
      await writeFile(join(dir, path), bytes);
    }
    const read = await readSkillFolder(dir);
    if ("problem" in read) throw new InvalidSkillError(read.problem);
    return {
      name,
      description: read.skill.description,
      archive: await pack(files),
      digest: digestOf(files),
      size: [...files.values()].reduce((sum, bytes) => sum + bytes.length, 0),
      fileCount: files.size,
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/** The files of a skill folder on this machine. */
export async function readFolder(dir: string): Promise<SkillFiles> {
  const files: SkillFiles = new Map();
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.set(relative(dir, path).replaceAll("\\", "/"), new Uint8Array(await readFile(path)));
  }
  return files;
}
