import { createTool } from "@anvia/core";
import { expect, test } from "bun:test";
import { z } from "zod";

import { lateBoundTools } from "./late-bound-tools";

const tool = (name: string, answer: string) =>
  createTool({
    name,
    description: name,
    inputSchema: z.object({}),
    execute: () => answer,
  });

test("calls the sandbox the thread has now, not the one the agent was built with", async () => {
  let current = [tool("read_file", "old container")];
  const [bound] = lateBoundTools(current, () => current);
  expect(await bound!.call({})).toBe("old container");

  current = [tool("read_file", "new container")];
  expect(await bound!.call({})).toBe("new container");
});

test("says so when the thread has no sandbox, or the new one lacks the tool", () => {
  let current: ReturnType<typeof tool>[] | undefined;
  const [bound] = lateBoundTools([tool("read_file", "x")], () => current);
  expect(() => bound!.call({})).toThrow("read_file is unavailable");
  current = [tool("write_file", "y")];
  expect(() => bound!.call({})).toThrow("read_file is unavailable");
});
