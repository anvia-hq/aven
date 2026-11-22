import { describe, expect, test } from "bun:test";

import { UnavailableError } from "@aven/server-kit/errors";
import type { RuntimeConnection } from "../runtimes/hub";
import { runnerVia } from "../runtimes/ask-runner";
import { createComputerService } from "./service";

describe("createComputerService", () => {
  test("turns a runner timeout on status into UnavailableError instead of an uncaught 500", async () => {
    const runner = runnerVia(async () => {
      return {
        call: async () => {
          throw new Error("The runtime did not answer computer.status");
        },
      } as unknown as RuntimeConnection;
    });

    const service = createComputerService(runner);
    await expect(service.status("org-1", "thread-1")).rejects.toBeInstanceOf(UnavailableError);
  });

  test("returns available state when runner answers status", async () => {
    const runner = runnerVia(async () => {
      return {
        call: async () => ({ state: "awake" }),
      } as unknown as RuntimeConnection;
    });

    const service = createComputerService(runner);
    await expect(service.status("org-1", "thread-1")).resolves.toEqual({
      available: true,
      state: "awake",
    });
  });
});
