import { describe, expect, test } from "bun:test";

import { createForkTools, STOP_FORK_TOOL_NAME } from "./forks";
import type { ForkHost } from "./types";
import type { ForkView } from "@aven/protocol/types";

const ID = crypto.randomUUID();

const view = (changes: Partial<ForkView>): ForkView => ({
  id: ID,
  title: "Try it",
  running: false,
  archived: false,
  error: null,
  lastMessage: "",
  ...changes,
});

function stopTool(stopped: ForkView) {
  const stopCalls: string[] = [];
  const host: ForkHost = {
    start: async () => ({ id: ID, title: "x" }),
    status: async () => view({}),
    stop: async (id) => {
      stopCalls.push(id);
      return stopped;
    },
    take: async () => ({ empty: true }),
  };
  const tool = createForkTools(host).find(
    (item) => item.name === STOP_FORK_TOOL_NAME,
  ) as unknown as {
    call(input: unknown): Promise<{ note: string }>;
  };
  return { tool, stopCalls };
}

describe("stop_fork", () => {
  test("stops the fork it is given and says its run was cancelled", async () => {
    const { tool, stopCalls } = stopTool(view({ stopped: true }));
    expect((await tool.call({ id: ID })).note).toBe("The fork's run was cancelled.");
    expect(stopCalls).toEqual([ID]);
  });

  test("says when the fork was not working, and when it could not be stopped", async () => {
    expect((await stopTool(view({})).tool.call({ id: ID })).note).toContain("was not working");
    expect((await stopTool(view({ running: true })).tool.call({ id: ID })).note).toContain(
      "could not be stopped",
    );
  });
});
