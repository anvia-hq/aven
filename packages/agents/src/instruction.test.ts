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

test("a goal's own session is told the next one starts by itself, so it does not ask the person for a continue", () => {
  const section = codingInstructions(200, false)
    .split("<long_tasks>")[1]!
    .split("</long_tasks>")[0]!;
  expect(section).toContain("starts the next session by itself");
  expect(section).toContain("never ask the person to say continue");
  expect(codingInstructions(200, true)).not.toContain("say continue");
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
  expect(section).toContain("on the person's machine");
  expect(section).toContain("tell them the port");
  expect(section).toContain("You do not open it");
  expect(section).toContain("localhost and 127.0.0.1 mean the machine the page is opened on");
  expect(section).toContain("relative URLs");
  expect(section).toContain("Never offer open_browser for a separate backend API port");
  expect(section).toContain("make sure the app and its API work through one port");

  const sandbox = codingInstructions(200, true, "spaces")
    .split("<servers>")[1]!
    .split("</servers>")[0]!;
  expect(sandbox).toContain("inside this cloud sandbox");
  expect(sandbox).toContain("Playwright");
});

test("a request to pull from GitHub is fetched through the folder's own remote, not stopped at origin", () => {
  const section = codingInstructions(200).split("<machine>")[1]!.split("</machine>")[0]!;
  expect(section).toContain("pull, update, sync or fetch from main, upstream or GitHub");
  expect(section).toContain("git -C <folder> remote get-url origin");
  expect(section).toContain("merge FETCH_HEAD");
  expect(section).toContain("Do not change the folder itself");
});

test("the agent is told which machine it is on", () => {
  const computer = codingInstructions(200);
  expect(computer).toContain("on the person's own computer");
  expect(computer).toContain("a clone of the person's folder");
  expect(computer).not.toContain("Aven Cloud sandbox");

  const sandbox = codingInstructions(200, true, "spaces");
  expect(sandbox).toContain("Aven Cloud sandbox, on the spaces provider");
  expect(sandbox).toContain("a fresh clone of the project's repository");
  expect(sandbox).toContain("origin is that repository");
  expect(sandbox).toContain("git asks gh for it");
  expect(sandbox).not.toContain("a clone of the person's folder");
  expect(sandbox).not.toContain("git -C <folder>");
  expect(sandbox).not.toContain("the machine's own login");
  expect(codingInstructions(200, true, "boat")).toContain("on the boat provider");
});

test("the agent is told its GitHub identity is the one its commands already use, and not to change it", () => {
  const section = codingInstructions(200).split("<machine>")[1]!.split("</machine>")[0]!;
  expect(section).toContain("GH_TOKEN is set for the run");
  expect(section).toContain("never run gh auth login");
});

test("the agent is told what done means, to verify once with the narrowest check, and not to open guessed files", () => {
  for (const canHandOff of [true, false]) {
    const text = codingInstructions(200, canHandOff);
    const delivery = text.split("<delivery>")[1]!.split("</delivery>")[0]!;
    const verify = text.split("<verify>")[1]!.split("</verify>")[0]!;
    const workflow = text.split("<workflow>")[1]!.split("</workflow>")[0]!;
    expect(delivery).toContain("No stubs, placeholders");
    expect(delivery).toContain("clean cutover");
    expect(verify).toContain("narrowest check");
    expect(verify).toContain("once");
    expect(workflow).toContain("Never open guessed paths");
    expect(workflow).toContain("Batch independent calls");
  }
});

test("the agent is told to search with its own search tools, read pages with web_fetch and keep a task list", () => {
  for (const canHandOff of [true, false]) {
    const workflow = codingInstructions(200, canHandOff)
      .split("<workflow>")[1]!
      .split("</workflow>")[0]!;
    expect(workflow).toContain("grep");
    expect(workflow).toContain("glob");
    expect(workflow).toContain("web_fetch");
    expect(workflow).toContain("todo_write");
  }
});

test("the offer to open the browser is in the instructions of a run that can ask the user, and not of one that cannot", () => {
  expect(codingInstructions(200, true)).toContain("offer it with open_browser");
  expect(codingInstructions(200, false)).not.toContain("offer it with open_browser");
});
