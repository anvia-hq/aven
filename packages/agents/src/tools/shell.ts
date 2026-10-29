import { stat } from "node:fs/promises";
import { createTool } from "@anvia/core";
import { z } from "zod";

import type { JobRegistry, JobSnapshot } from "../jobs/job-registry";
import { resolveWithin } from "../lib/paths";
import { truncateTail } from "../lib/truncate";

export const SHELL_TOOL_NAME = "shell";
export const SHELL_OUTPUT_TOOL_NAME = "shell_output";
export const SHELL_KILL_TOOL_NAME = "shell_kill";

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

async function resolveWorkdir(root: string, workdir: string | undefined) {
  const { absolute } = await resolveWithin(root, workdir ?? ".");
  const info = await stat(absolute).catch(() => undefined);
  if (!info) throw new Error(`Working directory not found: ${workdir}`);
  if (!info.isDirectory()) throw new Error(`Working directory is not a directory: ${workdir}`);
  return absolute;
}

function startBackground(jobs: JobRegistry, input: { command: string; cwd: string }) {
  const { id } = jobs.start({ ...input, background: true });
  return {
    jobId: id,
    status: "running" as const,
    exitCode: null,
    truncated: false,
    output: `Command started in the background (job ${id}). ${BACKGROUND_NOTICE}`,
  };
}

// Only foreground jobs are tied to the tool call; background jobs outlive it.
async function runForeground(
  jobs: JobRegistry,
  input: { command: string; cwd: string; timeout?: number },
  abortSignal: AbortSignal | undefined,
) {
  const timeoutMs = input.timeout ?? DEFAULT_TIMEOUT_MS;
  const { id, done } = jobs.start({ command: input.command, cwd: input.cwd, timeoutMs });
  const kill = () => void jobs.kill(id);
  // An abort that happened before the job existed fires no event, so check it now.
  if (abortSignal?.aborted) kill();
  abortSignal?.addEventListener("abort", kill, { once: true });
  try {
    const out = result(await done);
    if (out.status !== "timeout") return out;
    return {
      ...out,
      output: `${out.output}\n\nCommand exceeded the timeout of ${timeoutMs} ms and was killed. Retry with a larger timeout, or run it in the background.`,
    };
  } finally {
    abortSignal?.removeEventListener("abort", kill);
    jobs.forget(id);
  }
}

export function createShellTools({ root, jobs }: ShellToolsOptions) {
  const shell = createTool({
    name: SHELL_TOOL_NAME,
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
      const cwd = await resolveWorkdir(root, workdir);
      if (background) return startBackground(jobs, { command, cwd });
      return runForeground(jobs, { command, cwd, timeout }, context?.abortSignal);
    },
  });

  const shellOutput = createTool({
    name: SHELL_OUTPUT_TOOL_NAME,
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
    name: SHELL_KILL_TOOL_NAME,
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
