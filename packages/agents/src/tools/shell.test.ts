import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { formatJobNotice, JobRegistry, type JobSnapshot } from "../jobs/job-registry";
import { createShellTools } from "./shell";

let root: string;
let jobs: JobRegistry;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aven-shell-"));
  jobs = new JobRegistry();
});

afterEach(async () => {
  await jobs.disposeAll();
  await rm(root, { recursive: true, force: true });
});

const alive = async (pattern: string) =>
  (await Bun.$`pgrep -f ${pattern}`.nothrow().quiet()).exitCode === 0;

describe("shell (foreground)", () => {
  test("returns output and exit code, merging stderr", async () => {
    const { shell } = createShellTools({ root, jobs });
    const ok = await shell.call({ command: "echo hello; echo oops >&2" });
    expect(ok.status).toBe("completed");
    expect(ok.exitCode).toBe(0);
    expect(ok.output).toContain("hello");
    expect(ok.output).toContain("oops");

    const failed = await shell.call({ command: "exit 3" });
    expect(failed.status).toBe("failed");
    expect(failed.exitCode).toBe(3);
  });

  test("runs in the working directory and rejects ones outside the root", async () => {
    const { shell } = createShellTools({ root, jobs });
    const cwd = await shell.call({ command: "pwd", workdir: "." });
    expect(cwd.output.trim().endsWith(root.split("/").pop()!)).toBe(true);
    await expect(Promise.resolve(shell.call({ command: "pwd", workdir: ".." }))).rejects.toThrow(
      "outside",
    );
  });

  test("kills the whole process group on timeout", async () => {
    const { shell } = createShellTools({ root, jobs });
    const started = Date.now();
    const out = await shell.call({ command: "sleep 31 & wait", timeout: 300 });
    expect(out.status).toBe("timeout");
    expect(out.output).toContain("exceeded the timeout");
    expect(Date.now() - started).toBeLessThan(5000);
    await Bun.sleep(100);
    expect(await alive("sleep 31")).toBe(false);
  });

  test("escalates to SIGKILL when the command ignores SIGTERM", async () => {
    const { shell } = createShellTools({ root, jobs });
    const started = Date.now();
    const out = await shell.call({ command: "trap '' TERM; sleep 34", timeout: 300 });
    expect(out.status).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(4000);
    await Bun.sleep(100);
    expect(await alive("sleep 34")).toBe(false);
  });

  test("an aborted tool call kills the command", async () => {
    const { shell } = createShellTools({ root, jobs });
    const controller = new AbortController();
    const pending = shell.call(
      { command: "sleep 32" },
      { abortSignal: controller.signal },
    ) as Promise<{ status: string }>;
    await Bun.sleep(100);
    controller.abort();
    expect((await pending).status).toBe("killed");
    expect(await alive("sleep 32")).toBe(false);
  });

  test("truncates huge output to its tail", async () => {
    const { shell } = createShellTools({ root, jobs });
    const out = await shell.call({ command: "yes aaaaaaaaaa | head -n 20000; echo END" });
    expect(out.truncated).toBe(true);
    expect(out.output.length).toBe(30_000);
    expect(out.output.trimEnd().endsWith("END")).toBe(true);
  });
});

describe("shell (background)", () => {
  test("returns immediately, then reports completion with output", async () => {
    const { shell, shellOutput } = createShellTools({ root, jobs });
    const finished = new Promise<JobSnapshot>((resolve) => {
      jobs.onComplete((job) => job.background && resolve(job));
    });

    const started = Date.now();
    const out = await shell.call({ command: "echo early; sleep 0.5; echo done", background: true });
    expect(Date.now() - started).toBeLessThan(200);
    expect(out.status).toBe("running");

    await Bun.sleep(150);
    const running = await shellOutput.call({ jobId: out.jobId });
    expect(running.status).toBe("running");
    expect(running.output).toContain("early");
    expect(running.output).not.toContain("done");

    const job = await finished;
    expect(job.status).toBe("completed");
    expect(job.output).toContain("done");
    expect(formatJobNotice(job)).toContain(`job ${job.id}, completed, exit 0`);
    expect((await shellOutput.call({ jobId: job.id })).output).toContain("done");
  });

  test("a background job survives its tool call and shell_kill stops it and its children", async () => {
    const { shell, shellKill } = createShellTools({ root, jobs });
    const controller = new AbortController();
    const out = await shell.call(
      { command: "sleep 33 & wait", background: true },
      { abortSignal: controller.signal },
    );
    controller.abort();
    await Bun.sleep(150);
    expect(jobs.snapshot(out.jobId)?.status).toBe("running");
    expect(await alive("sleep 33")).toBe(true);

    const killed = await shellKill.call({ jobId: out.jobId });
    expect(killed).toEqual({ jobId: out.jobId, killed: true, status: "killed" });
    await Bun.sleep(100);
    expect(await alive("sleep 33")).toBe(false);
  });

  test("shell_output and shell_kill reject unknown jobs", async () => {
    const { shellOutput, shellKill } = createShellTools({ root, jobs });
    await expect(Promise.resolve(shellOutput.call({ jobId: "nope" }))).rejects.toThrow("Unknown");
    await expect(Promise.resolve(shellKill.call({ jobId: "nope" }))).rejects.toThrow("Unknown");
  });
});
