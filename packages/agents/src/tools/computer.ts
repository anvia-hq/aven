import { createTool } from "@anvia/core";
import type { ComputerState } from "@aven/protocol/types";
import { z } from "zod";

export const COMPUTER_STATUS_TOOL_NAME = "computer_status";
export const COMPUTER_WAKE_TOOL_NAME = "computer_wake";

export type ComputerHost = {
  status(): Promise<ComputerState>;
  wake(): Promise<{ before: ComputerState; state: ComputerState }>;
};

export function createComputerTools(host: ComputerHost) {
  const status = createTool({
    name: COMPUTER_STATUS_TOOL_NAME,
    description:
      "Say whether your computer, where your commands, files and processes are, is asleep, waking or awake. Your command and file tools start it themselves, so you need this only to know before you rely on something that was running in it.",
    inputSchema: z.object({}),
    async execute() {
      return { state: await host.status() };
    },
  });
  const wake = createTool({
    name: COMPUTER_WAKE_TOOL_NAME,
    description:
      "Wake your computer and wait until it is awake. It answers at once when the computer is awake already. Your command and file tools wake it themselves, so call this only when you want it up before you need it.",
    inputSchema: z.object({}),
    async execute() {
      const { before, state } = await host.wake();
      if (before === "asleep") {
        return {
          state,
          summary:
            "The computer was asleep and is awake now. What was running in it before has stopped; /workspace is as you left it.",
        };
      }
      return { state, summary: "The computer was already awake." };
    },
  });
  return [status, wake];
}
