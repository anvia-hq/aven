import { expect, test } from "bun:test";

import { environmentInstructions } from "./environment";
import { INSTRUCTIONS } from "./instruction";
import { skillsInstructions } from "./skills";

test("every tag in the instructions is closed and named once", () => {
  const skills = skillsInstructions([{ name: "a", description: "A.", path: "/skills/a/SKILL.md" }]);
  const text = [INSTRUCTIONS, skills, environmentInstructions(["X"])].join("\n\n");
  const opens = [...text.matchAll(/^<([a-z_]+)>$/gm)].map((match) => match[1]);
  const closes = [...text.matchAll(/^<\/([a-z_]+)>$/gm)].map((match) => match[1]);
  expect(closes).toEqual(opens);
  expect(new Set(opens).size).toBe(opens.length);
});
