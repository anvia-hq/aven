import { describe, expect, test } from "bun:test";

import { NotFoundError } from "@aven/server-kit/errors";
import type { RuntimeHub } from "../runtimes/hub";
import { createActionsService } from "./service";
import type { FileResult } from "../files/types";

const yaml = [
  "actions:",
  "  - name: Test",
  "    run: bun test",
  "  - name: Fix lint",
  "    prompt: Fix what the linter reports",
].join("\n");

function setup(file: FileResult) {
  const sent: { userId: string; threadId: string; prompt: string; modelId?: string }[] = [];
  const service = createActionsService({} as RuntimeHub, {
    readFile: async () => file,
    send: async (_organizationId, userId, threadId, body) => {
      sent.push({ userId, threadId, ...body });
    },
  });
  return { service, sent };
}

const text = (value: string, truncated = false): FileResult =>
  ({ available: true, kind: "text", text: value, truncated }) as FileResult;

describe("a thread's actions", () => {
  test("lists names and kinds, never the commands or prompts", async () => {
    const { service } = setup(text(yaml));
    expect(await service.list("org", "t1")).toEqual({
      actions: [
        { name: "Test", kind: "run" },
        { name: "Fix lint", kind: "prompt" },
      ],
      problem: null,
    });
  });

  test("lists none when the file is missing or the sandbox is not reachable", async () => {
    expect(
      (await setup({ available: true, kind: "missing" } as FileResult).service.list("org", "t1"))
        .actions,
    ).toEqual([]);
    expect(await setup({ available: false } as FileResult).service.list("org", "t1")).toEqual({
      actions: [],
      problem: null,
    });
  });

  test("says a file that is cut short cannot be used", async () => {
    const { service } = setup(text(yaml, true));
    const listed = await service.list("org", "t1");
    expect(listed.actions).toEqual([]);
    expect(listed.problem).toBeString();
  });

  test("sends a prompt action's own text with the model chosen, as the person", async () => {
    const { service, sent } = setup(text(yaml));
    expect(await service.start("org", "u1", "t1", { name: "Fix lint", modelId: "m" })).toEqual({
      kind: "prompt",
    });
    expect(sent).toEqual([
      { userId: "u1", threadId: "t1", prompt: "Fix what the linter reports", modelId: "m" },
    ]);
  });

  test("refuses a name the file does not list", async () => {
    const { service, sent } = setup(text(yaml));
    await expect(service.start("org", "u1", "t1", { name: "rm -rf /" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(sent).toEqual([]);
  });
});
