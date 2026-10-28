import { stat } from "node:fs/promises";
import { createTool } from "@anvia/core";
import { z } from "zod";

import type { JobRegistry, JobSnapshot } from "../jobs/job-registry";
import { resolveWithin } from "../lib/paths";
import { truncateTail } from "../lib/truncate";

export const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;

const BACKGROUND_NOTICE =
  "You will be notified automatically when the command finishes, with its output. Do not poll for completion: repeatedly sleeping or calling shell_output is not useful work. Keep working on anything that does not depend on the result; if there is nothing else to do, end your response and you will be resumed when it finishes.";

export type ShellToolsOptions = {
  /** Directory commands start in. The shell itself is NOT confined to it. */
  root: string;
  jobs: JobRegistry;
};

function result(job: JobSnapshot, maxChars?: number) {
  const { text, truncated } = truncateTail(job.output, maxChars);
  return {
    jobId: job.id,
    status: job.status,
    exitCode: job.exitCode,
    output: text,
    truncated,
  };
}

export function createShellTools({ root, jobs }: ShellToolsOptions) {
  const shell = createTool({
    name: "shell",
    description: [
      "Execute a shell command and return its output.",
      "Prefer the dedicated read, write and edit tools for files.",
      "Set `workdir` instead of using `cd` in the command.",
      `Foreground commands time out after ${DEFAULT_TIMEOUT_MS} ms by default (timeout 0 disables it) and are killed on timeout.`,
      "Set `background: true` for dev servers and long builds: the call returns a jobId immediately and the command keeps running. Background commands have no timeout.",
      BACKGROUND_NOTICE,
    ].join(" "),
    inputSchema: z.object({
      command: z.string().min(1).describe("Shell command to execute."),
      workdir: z.string().optional().describe("Directory to run in (default: the project root)."),
      timeout: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Timeout in milliseconds; 0 disables. Foreground only."),
      background: z.boolean().optional().describe("Run in the background and return immediately."),
    }),
    async execute({ command, workdir, timeout, background = false }, context) {
      const cwd = await resolveWithin(root, workdir ?? ".");
      if (!(await stat(cwd.absolute)).isDirectory()) {
        throw new Error(`Working directory is not a directory: ${workdir}`);
      }

      const { id, done } = jobs.start({
        command,
        cwd: cwd.absolute,
        background,
        timeoutMs: background ? 0 : (timeout ?? DEFAULT_TIMEOUT_MS),
      });

      if (background) {
        return {
          jobId: id,
          status: "running" as const,
          exitCode: null,
          truncated: false,
          output: `Command started in the background (job ${id}). ${BACKGROUND_NOTICE}`,
        };
      }

      // Only foreground jobs are tied to the tool call; background jobs outlive it.
      const onAbort = () => void jobs.kill(id);
      context?.abortSignal?.addEventListener("abort", onAbort, { once: true });
      try {
        const job = await done;
        const out = result(job);
        return job.status === "timeout"
          ? {
              ...out,
              output: `${out.output}\n\nCommand exceeded the timeout of ${timeout ?? DEFAULT_TIMEOUT_MS} ms and was killed. Retry with a larger timeout, or run it in the background.`,
            }
          : out;
      } finally {
        context?.abortSignal?.removeEventListener("abort", onAbort);
        jobs.forget(id);
      }
    },
  });

  const shellOutput = createTool({
    name: "shell_output",
    description:
      "Read the current output and status of a background shell job. Use it to inspect a long-running job (e.g. a dev server's logs), not to wait for completion: you are notified automatically when a job finishes.",
    inputSchema: z.object({ jobId: z.string().min(1) }),
    execute({ jobId }) {
      const job = jobs.snapshot(jobId);
      if (!job) throw new Error(`Unknown job: ${jobId}`);
      return result(job);
    },
  });

  const shellKill = createTool({
    name: "shell_kill",
    description: "Stop a running background shell job and everything it spawned.",
    inputSchema: z.object({ jobId: z.string().min(1) }),
    async execute({ jobId }) {
      if (!jobs.snapshot(jobId)) throw new Error(`Unknown job: ${jobId}`);
      const killed = await jobs.kill(jobId);
      return { jobId, killed, status: jobs.snapshot(jobId)?.status };
    },
  });

  return { shell, shellOutput, shellKill };
}
