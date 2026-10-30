import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readSkillFolders, skillsInstructions } from "./skills";

const root = await mkdtemp(join(tmpdir(), "aven-skills-"));
afterAll(() => rm(root, { recursive: true, force: true }));

async function writeSkill(folder: string, text: string) {
  await mkdir(join(root, folder), { recursive: true });
  await writeFile(join(root, folder, "SKILL.md"), text);
}

test("one broken skill folder is reported and the others are read", async () => {
  await writeSkill("good", "---\nname: good\ndescription: A good one.\n---\nDo it.");
  await writeSkill("mismatch", "---\nname: other\ndescription: Wrong folder.\n---\n");
  await writeFile(join(root, "stray.txt"), "not a skill");

  const { skills, problems } = await readSkillFolders(root);

  expect(skills.map((skill) => skill.name)).toEqual(["good"]);
  expect(problems).toEqual([
    { folder: "mismatch", problem: "name must match the skill directory name" },
  ]);
});

test("a missing folder has no skills", async () => {
  expect(await readSkillFolders(join(root, "nope"))).toEqual({ skills: [], problems: [] });
});

test("the instructions list each skill with its path, and say nothing without any", () => {
  expect(skillsInstructions([])).toBe("");
  const text = skillsInstructions([
    { name: "good", description: "A good one.", path: "/skills/good/SKILL.md" },
  ]);
  expect(text).toContain("- good: A good one. (/skills/good/SKILL.md)");
  expect(text).toContain("read_file");
});
