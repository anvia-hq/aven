import { ConflictError, UnavailableError } from "@aven/server-kit/errors";
import { runtimeActivity } from "../runtimes/activity";
import { computerInfo } from "./schema";
import type { ComputerStatus } from "./types";
import type { Refusal, Runner } from "../runtimes/types";

export const WAKE_TIMEOUT_MS = 120_000;

const statusRefused: Refusal = {
  logged: "The status of a computer was refused:",
  message: "The computer status could not be checked",
};

const wakeRefused: Refusal = {
  logged: "The wake-up of a computer was refused:",
  message: "The computer could not be started",
  instead: (reason) =>
    /no workspace/i.test(reason)
      ? new ConflictError(
          "The thread has no workspace yet. Its folder is made when the agent first works on it",
        )
      : undefined,
};

export function createComputerService(runner: Runner) {
  return {
    async status(scope: string, threadId: string): Promise<ComputerStatus> {
      const info = await runner.ask(
        scope,
        "computer.status",
        { threadId },
        computerInfo,
        statusRefused,
      );
      return info ? { available: true, state: info.state } : { available: false };
    },

    async wake(scope: string, threadId: string): Promise<ComputerStatus> {
      void runtimeActivity.touchThread(threadId);

      const info = await runner.ask(
        scope,
        "computer.wake",
        { threadId },
        computerInfo,
        wakeRefused,
        WAKE_TIMEOUT_MS,
      );

      if (!info) throw new UnavailableError("The computer could not be started");

      return { available: true, state: info.state };
    },
  };
}
