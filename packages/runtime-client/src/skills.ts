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

export type FetchSkill = (digest: string) => Promise<Uint8Array>;

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

async function makeScriptsRunnable(dir: string) {
  const scripts = join(dir, "scripts");
  const entries = await readdir(scripts, { withFileTypes: true, recursive: true }).catch(() => []);
  for (const entry of entries)
    if (entry.isFile()) await chmod(join(entry.parentPath, entry.name), 0o755);
}

async function isInside(root: string, path: string) {
  const real = await realpath(path).catch(() => undefined);
  return real !== undefined && real.startsWith(root + sep);
}

async function repositorySkills(threadId: string, workspace: string) {
  const root = await realpath(workspace);
  const { skills, problems } = await readSkillFolders(join(root, REPO_SKILLS_DIR));
  for (const { folder, problem } of problems)
    console.warn(`Repository skill "${folder}" is left out for ${threadId}: ${problem}`);
  const listed: SkillListing[] = [];
  for (const skill of skills) {
    if (!(await isInside(root, join(skill.directory, "SKILL.md")))) {
      console.warn(
        `Repository skill "${skill.name}" is left out for ${threadId}: it leaves the workspace`,
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

export class SkillStore {
  constructor(readonly root: string) {}

  async dir(threadId: string) {
    if (!/^[\w-]+$/.test(threadId)) throw new Error("Invalid thread id");
    const dir = join(this.root, "threads", threadId);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  async install(
    threadId: string,
    skills: readonly RunSkill[],
    fetch: FetchSkill,
    workspace?: string,
  ): Promise<SkillListing[]> {
    const dir = await this.dir(threadId);
    for (const entry of await readdir(dir))
      await rm(join(dir, entry), { recursive: true, force: true });

    const listed = new Map<string, SkillListing>();
    for (const wanted of skills) {
      try {
        if (!SKILL_DIGEST.test(wanted.digest)) throw new Error("its digest is not one");
        if (!SKILL_NAME.test(wanted.name)) throw new Error("its name is not one");
        const target = join(dir, wanted.name);
        await cp(await this.#cached(wanted.digest, fetch), target, { recursive: true });
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
        console.warn(`Skill "${wanted.name}" is left out for ${threadId}: ${errorMessage(error)}`);
      }
    }

    if (workspace)
      for (const skill of await repositorySkills(threadId, workspace))
        listed.set(skill.name, skill);
    return [...listed.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async #cached(digest: string, fetch: FetchSkill) {
    const dir = join(this.root, "cache", digest);
    if (await exists(dir)) return dir;
    const partial = `${dir}.${crypto.randomUUID()}`;
    try {
      await new Bun.Archive(await fetch(digest)).extract(partial);
      await makeScriptsRunnable(partial);
      await rename(partial, dir).catch(async (error: NodeJS.ErrnoException) => {
        if (!(await exists(dir))) throw error;
      });
    } finally {
      await rm(partial, { recursive: true, force: true });
    }
    return dir;
  }
}
