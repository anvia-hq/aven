import { describe, expect, test } from "bun:test";
import { readSkillFolders } from "@aven/agents/skills";

import { BUILTIN_SKILLS_DIR } from "./builtins";

// A built-in skill that does not validate is only logged and left out when the app runs, so a typo
// in one (a colon in a description, a name that is not its folder's) would go unnoticed.
describe("the built-in skills", () => {
  test("every folder is a valid skill, and these are the ones there are", async () => {
    const { skills, problems } = await readSkillFolders(BUILTIN_SKILLS_DIR);

    expect(problems).toEqual([]);
    expect(skills.map((skill) => skill.name).sort()).toEqual([
      "setup-env",
      "setup-ship",
      "writing-skills",
    ]);
    for (const skill of skills) {
      expect(skill.description.length).toBeGreaterThan(40);
      expect(skill.description.length).toBeLessThanOrEqual(1024);
    }
  });
});
