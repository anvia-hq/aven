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
  expect(text).not.toContain("200 turns");
});

test("a goal's own session is not told to use define_goal, which it does not have", () => {
  const section = codingInstructions(200, false)
    .split("<long_tasks>")[1]!
    .split("</long_tasks>")[0]!;
  expect(section).toContain("You have 200 turns for each session");
  expect(section).toContain("past about 120 turns");
  expect(section).not.toContain("define_goal");
  expect(section).not.toContain("ask_user");
});

test("an agent that can hand a task to a goal is told how", () => {
  const text = codingInstructions(200, true);
  expect(text).toContain("for each message of the user");
  expect(text).toContain("hand it to define_goal");
});

test("a goal's own session is told to work in tool calls and report a major step in one paragraph", () => {
  const text = codingInstructions(200, false);
  const section = text.split("<reporting>")[1]!.split("</reporting>")[0]!;
  expect(section).toContain("spend your turns on tool calls");
  expect(section).toContain("only when something major or important has happened");
  expect(section).toContain("one paragraph of two to four full sentences");
  const opens = [...text.matchAll(/^<([a-z_]+)>$/gm)].map((match) => match[1]);
  const closes = [...text.matchAll(/^<\/([a-z_]+)>$/gm)].map((match) => match[1]);
  expect(closes).toEqual(opens);
  expect(new Set(opens).size).toBe(opens.length);
});

test("an agent that talks to a person is not told to keep quiet between tool calls", () => {
  expect(codingInstructions(200, true)).not.toContain("<reporting>");
});

test("the agent is told to show proof of its work, and a goal's session too", () => {
  for (const canHandOff of [true, false]) {
    const text = codingInstructions(200, canHandOff);
    expect(text).toContain("<proof>");
    expect(text).toContain("show proof that it works");
    expect(text).toContain("show_artifact");
  }
});

test("the agent is told to end its turn and be woken when a process ends, and never to sleep in a command or wait with a tool", () => {
  const text = codingInstructions(200, true);
  expect(text).toContain("a message that starts with [process]");
  expect(text).toContain("end your turn");
  expect(text).toContain("Never wait with sleep in a command");
  expect(text).not.toContain("wait_for_process");
});

test("the agent is told its commands already start in /workspace, so it does not cd there each time", () => {
  expect(codingInstructions(200, true)).toContain("do not begin one with cd /workspace");
});

test("the instructions tell the agent about the people in a thread and @agent", () => {
  const text = codingInstructions(200);
  expect(text).toContain("[driver: Name]");
  expect(text).toContain("@agent");
});

test("the agent is told a server runs on the machine and that localhost is the page's own in the person's browser", () => {
  const section = codingInstructions(200).split("<servers>")[1]!.split("</servers>")[0]!;
  expect(section).toContain("tell them the port");
  expect(section).toContain("localhost and 127.0.0.1 mean the machine the page is opened on");
  expect(section).toContain("relative URLs");
});
