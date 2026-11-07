import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { SkillValidationError, skill } from "@anvia/core";
import type { Skill } from "@anvia/core/skills";

import { errorMessage } from "./values";

export const SKILLS_DIR = "/skills";

export const REPO_SKILLS_DIR = ".aven/skills";

export const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SKILL_NAME = 64;

export type SkillListing = { name: string; description: string; path: string };

function skillProblem(error: unknown) {
  if (error instanceof SkillValidationError)
    return error.issues.map((issue) => issue.message).join("; ");
  return errorMessage(error);
}

export async function readSkillFolder(
  dir: string,
): Promise<{ skill: Skill } | { problem: string }> {
  try {
    const [found] = await skill.local(dir).load();
    return found ? { skill: found } : { problem: "SKILL.md is missing" };
  } catch (error) {
    return { problem: skillProblem(error) };
  }
}

export async function readSkillFolders(dir: string) {
  const skills: Skill[] = [];
  const problems: { folder: string; problem: string }[] = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const read = await readSkillFolder(join(dir, entry.name));
    if ("skill" in read) skills.push(read.skill);
    else problems.push({ folder: entry.name, problem: read.problem });
  }
  return { skills, problems };
}

export function skillsInstructions(skills: readonly SkillListing[]) {
  if (skills.length === 0) return "";
  return [
    "<skills>",
    "You have skills: instructions for particular kinds of task, kept as files in the sandbox. Before a task one of them fits, read its SKILL.md and follow it. Read it with exec_command, for example cat /skills/<name>/SKILL.md: read_file only reaches /workspace, and the skills are in /skills (one of the repository's, in /workspace/.aven/skills, can be read with read_file too). A skill's other files (references/, scripts/) are next to its SKILL.md; read them the same way when it says to, and run its scripts with exec_command. Skills are read-only.",
    "Available skills:",
    ...skills.map((entry) => `- ${entry.name}: ${entry.description} (${entry.path})`),
    "</skills>",
  ].join("\n");
}
