import { expect, test } from "bun:test";

import { environmentInstructions } from "./environment";
import { codingInstructions } from "./instruction";
import { CODING_MAX_TURNS } from "./turn-limits";
import { skillsInstructions } from "./skills";

test("every tag in the instructions is closed and named once", () => {
  const skills = skillsInstructions([{ name: "a", description: "A.", path: "/skills/a/SKILL.md" }]);
  const text = [codingInstructions(CODING_MAX_TURNS), skills, environmentInstructions(["X"])].join(
    "\n\n",
  );
  const opens = [...text.matchAll(/^<([a-z_]+)>$/gm)].map((match) => match[1]);
  const closes = [...text.matchAll(/^<\/([a-z_]+)>$/gm)].map((match) => match[1]);
  expect(closes).toEqual(opens);
  expect(new Set(opens).size).toBe(opens.length);
});

test("the instructions tell the agent its turn budget and when to hand a task to a goal", () => {
  const text = codingInstructions(200);
  expect(text).toContain("You have 200 turns");
  expect(text).toContain("more than about 50 turns");
  expect(text).toContain("past about 120 turns");
  expect(text).toContain("define_goal");
});

test("the numbers follow the budget the agent is given", () => {
  const text = codingInstructions(40);
  expect(text).toContain("You have 40 turns");
  expect(text).toContain("more than about 10 turns");
  expect(text).not.toContain("200");
});
