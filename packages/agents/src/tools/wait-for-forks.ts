import { createTool } from "@anvia/core";
import { z } from "zod";

import { MAX_WAIT_SECONDS, realClock } from "../internal/clock";
import type { Clock } from "./types";
import type { ForkView } from "@aven/protocol/types";

export const WAIT_FOR_FORKS_TOOL_NAME = "wait_for_forks";

const DEFAULT_WAIT_SECONDS = 120;
const POLL_MS = 5000;
const REPORT_MAX = 2000;

const seconds = (ms: number) => Math.round(ms / 1000);

export const forkState = (fork: Pick<ForkView, "running" | "error">) => {
  if (fork.running) return "running";

  return fork.error ? `failed (${fork.error})` : "stopped";
};

export function createWaitForForksTool(
  look: (id: string) => Promise<ForkView>,
  clock: Clock = realClock,
) {
  return createTool({
    name: WAIT_FOR_FORKS_TOOL_NAME,
    description: `Wait for forks of this thread (from fork_thread) to stop working. It returns as soon as none of the forks given is working any more (done, failed, or stopped to ask the user something), or after \`timeoutSeconds\` (up to ${MAX_WAIT_SECONDS}), whichever is first; if some are still working then, call it again. Use it when the user asked you to take the forks' work or open pull requests: wait, then take each one's changes with take_fork_changes. Do not wait with \`sleep\` in a command.`,
    inputSchema: z.object({
      ids: z.array(z.uuid()).min(1).max(12).describe("The ids fork_thread gave you."),
      timeoutSeconds: z
        .int()
        .min(1)
        .max(MAX_WAIT_SECONDS)
        .optional()
        .describe(`How long to wait at most; ${DEFAULT_WAIT_SECONDS} when not given.`),
    }),
    async handler({ ids, timeoutSeconds = DEFAULT_WAIT_SECONDS }, context) {
      const started = clock.now();
      const deadline = started + timeoutSeconds * 1000;
      for (;;) {
        context?.abortSignal?.throwIfAborted();
        const forks = await Promise.all([...new Set(ids)].map(look));
        const working = forks.filter((fork) => fork.running).length;
        const waited = seconds(clock.now() - started);

        if (working === 0 || clock.now() >= deadline) {
          const summary =
            working === 0
              ? `All ${forks.length} forks have stopped working after ${waited}s.`
              : `${working} of ${forks.length} forks are still working after ${waited}s.`;
          const entries = forks.map((fork) => {
            const state = forkState(fork);
            const report = fork.lastMessage.trim();
            const clipped = report.length > REPORT_MAX ? `…${report.slice(-REPORT_MAX)}` : report;
            return clipped
              ? `- ${fork.id} (${fork.title}) [${state}]\n  ${clipped.replaceAll("\n", "\n  ")}`
              : `- ${fork.id} (${fork.title}) [${state}]`;
          });
          return `${summary}\n${entries.join("\n")}`;
        }

        await clock.sleep(Math.min(POLL_MS, deadline - clock.now()), context?.abortSignal);
      }
    },
  });
}
