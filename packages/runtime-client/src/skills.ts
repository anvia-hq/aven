import { chmod, cp, mkdir, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import {
  REPO_SKILLS_DIR,
  SKILL_NAME,
  SKILLS_DIR,
  readSkillFolder,
  readSkillFolders,
  type SkillListing,
} from "@aven/agents/skills";
import { WORKSPACE_DIR } from "@aven/agents/sandbox-tools";
import { errorMessage } from "@aven/agents/values";
import { SKILL_DIGEST, type RunSkill } from "@aven/protocol/runtime-wire";

/** Gets a skill's folder as a `.tar.gz` from the control plane. */
export type FetchSkill = (digest: string) => Promise<Uint8Array>;

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

// An archive keeps no file modes we can trust, and a skill's scripts are meant to be run.
async function makeScriptsRunnable(dir: string) {
  const scripts = join(dir, "scripts");
  const entries = await readdir(scripts, { withFileTypes: true, recursive: true }).catch(() => []);
  for (const entry of entries)
    if (entry.isFile()) await chmod(join(entry.parentPath, entry.name), 0o755);
}

// Whether a path, links followed, is inside `root` (a real path).
async function isInside(root: string, path: string) {
  const real = await realpath(path).catch(() => undefined);
  return real !== undefined && real.startsWith(root + sep);
}

// The repository's own skills, read on this machine. The repository is not trusted, so a SKILL.md
// that links out of the workspace is left out, as the Files panel confines reads (decision 0031).
async function repositorySkills(threadId: string, workspace: string) {
  const root = await realpath(workspace);
  const { skills, problems } = await readSkillFolders(join(root, REPO_SKILLS_DIR));
  for (const { folder, problem } of problems)
    console.warn(`Repository skill "${folder}" is left out of thread ${threadId}: ${problem}`);
  const listed: SkillListing[] = [];
  for (const skill of skills) {
    if (!(await isInside(root, join(skill.directory, "SKILL.md")))) {
      console.warn(
        `Repository skill "${skill.name}" is left out of thread ${threadId}: it leaves the workspace`,
      );
      continue;
    }
    listed.push({
      name: skill.name,
      description: skill.description,
      path: `${WORKSPACE_DIR}/${REPO_SKILLS_DIR}/${skill.name}/SKILL.md`,
    });
  }
  return listed;
}

// The skills of runs (decision 0035). Every archive fetched is kept unpacked in `<root>/cache/<digest>`,
// and a thread's skills are copied into `<root>/threads/<thread id>/<name>`, which its containers
// mount read-only at /skills. Repository skills are read where they are, in the workspace.
export class SkillStore {
  constructor(readonly root: string) {}

  /** The thread's directory on this machine, the one its container mounts. */
  async dir(threadId: string) {
    if (!/^[\w-]+$/.test(threadId)) throw new Error("Invalid thread id");
    const dir = join(this.root, "threads", threadId);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  /**
   * Puts a run's skills in the thread's /skills, in place of the last run's, and lists them with
   * the repository's, which win on a name. A skill that cannot be fetched or does not validate
   * is left out, with a warning, so it never stops the run.
   */
  async install(
    threadId: string,
    skills: readonly RunSkill[],
    fetch: FetchSkill,
    workspace?: string,
  ): Promise<SkillListing[]> {
    const dir = await this.dir(threadId);
    // The directory itself stays: a running container's bind mount holds on to it.
    for (const entry of await readdir(dir))
      await rm(join(dir, entry), { recursive: true, force: true });

    const listed = new Map<string, SkillListing>();
    for (const wanted of skills) {
      try {
        if (!SKILL_DIGEST.test(wanted.digest)) throw new Error("its digest is not one");
        // A name is one path segment, so the folder is always in `dir`.
        if (!SKILL_NAME.test(wanted.name)) throw new Error("its name is not one");
        const target = join(dir, wanted.name);
        await cp(await this.#cached(wanted.digest, fetch), target, { recursive: true });
        // Anvia checks that the folder's name is the skill's own.
        const read = await readSkillFolder(target);
        if ("problem" in read) {
          await rm(target, { recursive: true, force: true });
          throw new Error(read.problem);
        }
        listed.set(read.skill.name, {
          name: read.skill.name,
          description: read.skill.description,
          path: `${SKILLS_DIR}/${read.skill.name}/SKILL.md`,
        });
      } catch (error) {
        console.warn(
          `Skill "${wanted.name}" is left out of thread ${threadId}: ${errorMessage(error)}`,
        );
      }
    }

    if (workspace)
      for (const skill of await repositorySkills(threadId, workspace))
        listed.set(skill.name, skill);
    return [...listed.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  // The unpacked folder of an archive, fetched the first time any run has it.
  async #cached(digest: string, fetch: FetchSkill) {
    const dir = join(this.root, "cache", digest);
    if (await exists(dir)) return dir;
    // Unpacked beside it and moved into place, so a half-written folder is never taken for one.
    const partial = `${dir}.${crypto.randomUUID()}`;
    try {
      await new Bun.Archive(await fetch(digest)).extract(partial);
      await makeScriptsRunnable(partial);
      await rename(partial, dir).catch(async (error: NodeJS.ErrnoException) => {
        // Another run of the same skill got there first.
        if (!(await exists(dir))) throw error;
      });
    } finally {
      await rm(partial, { recursive: true, force: true });
    }
    return dir;
  }
}
