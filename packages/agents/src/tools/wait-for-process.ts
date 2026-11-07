import { createTool } from "@anvia/core";
import { z } from "zod";

export const WAIT_FOR_PROCESS_TOOL_NAME = "wait_for_process";

/** The longest one call waits: a model's tool call is not meant to hold for minutes on end. */
export const MAX_WAIT_SECONDS = 240;
const DEFAULT_WAIT_SECONDS = 60;
const POLL_MS = 1000;

/** What the tool asks of the sandbox about one background process. */
export type ProcessWatch = {
  /** How the process is now; throws when there is no such process. */
  status(processId: string): Promise<{ status: string; exitCode?: number | null }>;
  /** The end of what it has printed, each stream as text. */
  tail(processId: string): Promise<{ stdout: string; stderr: string }>;
};

type Clock = {
  now(): number;
  sleep(ms: number, abortSignal?: AbortSignal): Promise<void>;
};

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, abortSignal) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      abortSignal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(abortSignal.reason);
        },
        { once: true },
      );
    }),
};

const seconds = (ms: number) => Math.round(ms / 1000);

// How the wait ended, in the words the agent and the thread's row both read.
function outcome(wait: {
  ended: boolean;
  matched: boolean;
  until?: string;
  exitCode?: number | null;
  waited: number;
}) {
  if (wait.ended) {
    const code = wait.exitCode == null ? "" : ` with exit code ${wait.exitCode}`;
    return `The process ended${code} after ${wait.waited}s.`;
  }
  if (wait.matched) {
    return `The output has "${wait.until}" after ${wait.waited}s; the process is still running.`;
  }
  return `The process is still running after ${wait.waited}s.`;
}

// Waits for a background process the agent started, and says how it stands when the wait is over
// (decision 0137): it ended, its output has the text the agent waits for, or the time ran out. An
// agent with nothing to wait on sleeps in a foreground command, which looks like a hang to the
// person and holds a command's whole timeout; this is a wait that is named and that ends early.
export function createWaitForProcessTool(watch: ProcessWatch, clock: Clock = realClock) {
  return createTool({
    name: WAIT_FOR_PROCESS_TOOL_NAME,
    description: `Wait for a background process (from start_process, or exec_command with background: true) and get the end of its output when the wait is over. It returns as soon as the process has ended, or its output contains the text in \`until\`, or \`timeoutSeconds\` (up to ${MAX_WAIT_SECONDS}) have passed, whichever is first; if the process is still running then, call it again. Use it instead of \`sleep\` in a command, which holds a command for its whole time and looks like a hang to the user. Pass \`until\` for a line that says the work is ready or finished, such as "Compiled successfully" or "listening on".`,
    inputSchema: z.object({
      processId: z.string().min(1).describe("The id start_process or exec_command returned."),
      timeoutSeconds: z
        .number()
        .int()
        .min(1)
        .max(MAX_WAIT_SECONDS)
        .optional()
        .describe(`How long to wait at most; ${DEFAULT_WAIT_SECONDS} when not given.`),
      until: z
        .string()
        .min(1)
        .max(200)
        .optional()
        .describe("Return as soon as the output contains this text, exactly as written."),
    }),
    async execute({ processId, timeoutSeconds = DEFAULT_WAIT_SECONDS, until }, context) {
      const started = clock.now();
      const deadline = started + timeoutSeconds * 1000;
      for (;;) {
        context?.abortSignal?.throwIfAborted();
        const { status, exitCode } = await watch.status(processId);
        const waited = seconds(clock.now() - started);
        const ended = status !== "running";
        const tail = ended || until ? await watch.tail(processId) : undefined;
        const matched = Boolean(until && tail && `${tail.stdout}\n${tail.stderr}`.includes(until));
        const timedOut = clock.now() >= deadline;
        if (ended || matched || timedOut) {
          // The tail is read once more when only the clock ended the wait, so the agent sees it.
          const shown = tail ?? (await watch.tail(processId));
          const how = outcome({ ended, matched, until, exitCode, waited });
          return {
            status: ended ? "ended" : "running",
            exitCode: exitCode ?? null,
            matched,
            waitedSeconds: waited,
            stdout: shown.stdout,
            stderr: shown.stderr,
            summary: how,
          };
        }
        await clock.sleep(Math.min(POLL_MS, deadline - clock.now()), context?.abortSignal);
      }
    },
  });
}
