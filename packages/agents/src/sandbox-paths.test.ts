import { describe, expect, test } from "bun:test";

import { codingInstructions } from "./instruction";
import { botInstructions } from "./bot-instruction";
import { sentPrompt } from "./attachments";
import { forPaths, SANDBOX_PATHS } from "./sandbox-paths";
import { subagentInstructions } from "./subagent-instruction";
import type { SandboxPaths } from "./types";

const host: SandboxPaths = {
  workspace: "/home/me/.aven/workspaces/t1",
  uploads: "/home/me/.aven/uploads/t1",
  skills: "/home/me/.aven/skills/threads/t1",
};

describe("the paths an agent is told about", () => {
  test("a sandbox's own paths leave an instruction as it is", () => {
    const text = codingInstructions(40);
    expect(forPaths(text, SANDBOX_PATHS)).toBe(text);
  });

  test("a thread's real paths replace the ones the instructions are written with", () => {
    const text = forPaths(codingInstructions(40), host);

    expect(text).not.toMatch(/(^|[^\w./-])\/(workspace|uploads|skills)(?![\w-])/);
    expect(text).toContain(`Every command starts in ${host.workspace}`);
    expect(text).toContain("on the person's own computer");
  });

  test("does the same for a subagent's instructions", () => {
    const text = forPaths(subagentInstructions("general"), host);

    expect(text).toContain("<machine>");
    expect(text).not.toMatch(/(^|[^\w./-])\/(workspace|uploads|skills)(?![\w-])/);
  });

  test("does the same for a bot's computer", () => {
    const text = forPaths(
      botInstructions({
        name: "Ada",
        handle: "ada",
        instruction: "",
        computer: true,
        peers: [],
      } as never),
      host,
    );

    expect(text).toContain(host.workspace);
    expect(text).not.toMatch(/(^|[^\w./-])\/(workspace|uploads)(?![\w-])/);
  });

  test("does not touch a path that only contains a sandbox folder's name", () => {
    expect(forPaths("see ./workspace and /srv/workspace-x and a/uploads", host)).toBe(
      "see ./workspace and /srv/workspace-x and a/uploads",
    );
  });

  test("points a mention and an attachment at the machine's paths", () => {
    const prompt = sentPrompt("look", {
      paths: host,
      mentions: [{ type: "file", name: "src/a.ts", from: 0, to: 1 }],
      attachments: [
        { name: "a.png", mediaType: "image/png", size: 3, path: `${host.uploads}/a.png` },
      ],
    });

    const text = JSON.stringify(prompt);
    expect(text).toContain(`${host.workspace}/src/a.ts`);
    expect(text).toContain("on this machine");
    expect(text).toContain(`${host.uploads}/a.png`);
  });
});
