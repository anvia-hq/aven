import { join } from "node:path";
import { readSkillFolders } from "@aven/agents/skills";

import { packSkill, readFolder, type PackedSkill } from "./package";

/** Where the skills every user has are kept, one folder each (decision 0035). */
export const BUILTIN_SKILLS_DIR = join(import.meta.dir, "../../../skills");

let loaded: Promise<PackedSkill[]> | undefined;

// Read once, on first use. A built-in skill that does not validate is a bug in this repository:
// it is reported and left out rather than taking every run down with it.
export function builtinSkills(dir = BUILTIN_SKILLS_DIR) {
  loaded ??= (async () => {
    const { skills, problems } = await readSkillFolders(dir);
    for (const { folder, problem } of problems)
      console.error(`Built-in skill "${folder}" is left out: ${problem}`);
    return Promise.all(skills.map(async (skill) => packSkill(await readFolder(skill.directory))));
  })();
  return loaded;
}
