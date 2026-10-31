import { expect, test } from "bun:test";

import { environmentInstructions } from "./environment";
import { INSTRUCTIONS, section } from "./instruction";
import { skillsInstructions } from "./skills";

function tagsBalance(text: string) {
  const opens = [...text.matchAll(/^<([a-z_]+)>$/gm)].map((match) => match[1]);
  const closes = [...text.matchAll(/^<\/([a-z_]+)>$/gm)].map((match) => match[1]);
  return { opens, closes };
}

test("section wraps its body in a tag", () => {
  expect(section("role", "Be kind.")).toBe("<role>\nBe kind.\n</role>");
});

test("every part of the instructions is a closed, named section", () => {
  const skills = skillsInstructions([{ name: "a", description: "A.", path: "/skills/a/SKILL.md" }]);
  const text = [INSTRUCTIONS, skills, environmentInstructions(["X"])].join("\n\n");
  const { opens, closes } = tagsBalance(text);
  expect(opens.length).toBeGreaterThan(5);
  expect(closes).toEqual(opens);
  expect(new Set(opens).size).toBe(opens.length);
});
