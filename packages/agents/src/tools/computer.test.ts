import { describe, expect, test } from "bun:test";
import type { ComputerState } from "@aven/protocol/types";

import {
  COMPUTER_STATUS_TOOL_NAME,
  COMPUTER_WAKE_TOOL_NAME,
  createComputerTools,
} from "./computer";

function toolsFor(options: { status: ComputerState; before: ComputerState; after: ComputerState }) {
  const [statusTool, wakeTool] = createComputerTools({
    status: async () => options.status,
    wake: async () => ({ before: options.before, state: options.after }),
  });
  return { statusTool: statusTool!, wakeTool: wakeTool! };
}

describe("createComputerTools", () => {
  test("computer_status reports the host state", async () => {
    for (const state of ["asleep", "waking", "awake"] as const) {
      const { statusTool } = toolsFor({ status: state, before: state, after: "awake" });
      expect(statusTool.name).toBe(COMPUTER_STATUS_TOOL_NAME);
      expect(await statusTool.call({})).toBe(`Computer state: ${state}.`);
    }
  });

  test("computer_wake says the computer woke up and prior processes stopped when it was asleep", async () => {
    const { wakeTool } = toolsFor({ status: "asleep", before: "asleep", after: "awake" });
    expect(wakeTool.name).toBe(COMPUTER_WAKE_TOOL_NAME);
    expect(await wakeTool.call({})).toBe(
      "The computer was asleep and is awake now. What was running in it before has stopped; /workspace is as you left it.",
    );
  });

  test("computer_wake says the computer was already awake when it was not asleep", async () => {
    const { wakeTool } = toolsFor({ status: "awake", before: "awake", after: "awake" });
    expect(await wakeTool.call({})).toBe("The computer was already awake.");
  });
});
