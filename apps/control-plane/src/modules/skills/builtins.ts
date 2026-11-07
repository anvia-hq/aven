import { join } from "node:path";
import { readSkillFolders } from "@aven/agents/skills";

import { packSkill, readFolder, type PackedSkill } from "./package";

export const BUILTIN_SKILLS_DIR = join(import.meta.dir, "../../../skills");

let loaded: Promise<PackedSkill[]> | undefined;

export function builtinSkills(dir = BUILTIN_SKILLS_DIR) {
  loaded ??= (async () => {
    const { skills, problems } = await readSkillFolders(dir);
    for (const { folder, problem } of problems)
      console.error(`Built-in skill "${folder}" is left out: ${problem}`);
    return Promise.all(skills.map(async (skill) => packSkill(await readFolder(skill.directory))));
  })();
  return loaded;
}
