import { join } from "node:path";
import { packSkill, readFolder } from "@aven/agents/skill-package";
import { readSkillFolders } from "@aven/agents/skills";
import type { PackedSkill } from "@aven/agents/types";

export const BUILTIN_SKILLS_DIR = join(import.meta.dir, "../../../skills");

let loaded: Promise<PackedSkill[]> | undefined;

export function builtinSkills() {
  loaded ??= (async () => {
    const { skills, problems } = await readSkillFolders(BUILTIN_SKILLS_DIR);
    for (const { folder, problem } of problems)
      console.error(`Built-in skill "${folder}" is left out: ${problem}`);
    return Promise.all(skills.map(async (skill) => packSkill(await readFolder(skill.directory))));
  })();
  return loaded;
}
