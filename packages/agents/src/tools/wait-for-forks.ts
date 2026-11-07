import { createTool } from "@anvia/core";
import type { ForkView } from "@aven/protocol/forks";
import { z } from "zod";

import { MAX_WAIT_SECONDS, realClock, type Clock } from "./clock";

export const WAIT_FOR_FORKS_TOOL_NAME = "wait_for_forks";

const DEFAULT_WAIT_SECONDS = 120;
// A look at a fork reads its thread's history, so this is slower than a process's poll.
const POLL_MS = 5000;
// What of a fork's last message comes back: its report is read with fork_status in full.
const REPORT_MAX = 2000;

const seconds = (ms: number) => Math.round(ms / 1000);

// Waits for forks of the agent's thread to stop (decision 0143): all of them finished, failed or
// stopped to ask the person, or the time ran out. The agent stays in its turn, so it keeps its own
// context and model and takes the work itself, and the thread shows a named wait rather than a hang.
export function createWaitForForksTool(
  look: (id: string) => Promise<ForkView>,
  clock: Clock = realClock,
) {
  return createTool({
    name: WAIT_FOR_FORKS_TOOL_NAME,
    description: `Wait for forks of this thread (from fork_thread) to stop working. It returns as soon as none of the forks given is working any more (done, failed, or stopped to ask the user something), or after \`timeoutSeconds\` (up to ${MAX_WAIT_SECONDS}), whichever is first; if some are still working then, call it again. Use it when the user asked you to take the forks' work or open pull requests: wait, then take each one's changes with take_fork_changes. Do not wait with \`sleep\` in a command.`,
    inputSchema: z.object({
      ids: z.array(z.string().uuid()).min(1).max(12).describe("The ids fork_thread gave you."),
      timeoutSeconds: z
        .number()
        .int()
        .min(1)
        .max(MAX_WAIT_SECONDS)
        .optional()
        .describe(`How long to wait at most; ${DEFAULT_WAIT_SECONDS} when not given.`),
    }),
    async execute({ ids, timeoutSeconds = DEFAULT_WAIT_SECONDS }, context) {
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
          return {
            allStopped: working === 0,
            waitedSeconds: waited,
            summary,
            forks: forks.map((fork) => ({
              id: fork.id,
              title: fork.title,
              running: fork.running,
              error: fork.error,
              lastMessage: fork.lastMessage.slice(-REPORT_MAX),
            })),
          };
        }
        await clock.sleep(Math.min(POLL_MS, deadline - clock.now()), context?.abortSignal);
      }
    },
  });
}
