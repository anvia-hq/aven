import { describe, expect, test } from "bun:test";

import { JobRegistry, type Launcher } from "./job-registry";

const bytes = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });

describe("JobRegistry when the process misbehaves", () => {
  test("a process whose exit cannot be read ends as failed instead of hanging", async () => {
    const launcher: Launcher = () => ({
      stdout: bytes(""),
      stderr: bytes(""),
      exited: Promise.reject(new Error("lost the process")),
      signal: () => undefined,
    });
    const jobs = new JobRegistry({ launcher });
    const job = await jobs.start({ command: "x", cwd: "/" }).done;
    expect(job.status).toBe("failed");
    expect(job.exitCode).toBeNull();
    expect(job.output).toContain("lost the process");
    await jobs.disposeAll();
  });

  test("killing a job that already exited reports its real status", async () => {
    // Its pipes stay open, so the job is still draining after the process is gone.
    const launcher: Launcher = () => ({
      stdout: new ReadableStream<Uint8Array>(),
      stderr: bytes(""),
      exited: Promise.resolve(0),
      signal: () => undefined,
    });
    const jobs = new JobRegistry({ launcher });
    const { id, done } = jobs.start({ command: "x", cwd: "/" });
    await Bun.sleep(20);
    expect(await jobs.kill(id)).toBe(false);
    expect((await done).status).toBe("completed");
  });

  test("forgets the job that finished longest ago, not the one that started first", async () => {
    const exits: ((code: number) => void)[] = [];
    const launcher: Launcher = () => ({
      stdout: bytes(""),
      stderr: bytes(""),
      exited: new Promise<number>((resolve) => exits.push(resolve)),
      signal: () => undefined,
    });
    const jobs = new JobRegistry({ launcher });
    const first = jobs.start({ command: "first", cwd: "/" });
    for (let i = 0; i < 50; i++)
      jobs.start({ command: `filler ${i}`, cwd: "/" }).done.catch(() => {});
    // The first job to start is the last to finish.
    for (const exit of exits.slice(1)) exit(0);
    await Bun.sleep(400);
    exits[0]!(0);
    await first.done;
    expect(jobs.snapshot(first.id)).toBeDefined();
    expect(jobs.list().length).toBe(50);
  });
});

describe("JobRegistry with another launcher", () => {
  test("runs through the launcher and reports its output and exit code", async () => {
    const seen: { command: string; cwd: string }[] = [];
    const launcher: Launcher = ({ command, cwd }) => {
      seen.push({ command, cwd });
      return {
        stdout: bytes("out\n"),
        stderr: bytes("err\n"),
        exited: Promise.resolve(3),
        signal: () => undefined,
      };
    };
    const jobs = new JobRegistry({ launcher });
    const { done } = jobs.start({ command: "do it", cwd: "/somewhere" });
    const job = await done;

    expect(seen).toEqual([{ command: "do it", cwd: "/somewhere" }]);
    expect(job.status).toBe("failed");
    expect(job.exitCode).toBe(3);
    expect(job.output).toContain("out");
    expect(job.output).toContain("err");
  });

  test("a kill signals the launched process and is reported as killed", async () => {
    const signals: string[] = [];
    let exit!: (code: number) => void;
    const launcher: Launcher = () => ({
      stdout: bytes(""),
      stderr: bytes(""),
      exited: new Promise<number>((resolve) => {
        exit = resolve;
      }),
      signal: (signal) => {
        signals.push(signal);
        exit(143);
      },
    });
    const jobs = new JobRegistry({ launcher });
    const { id, done } = jobs.start({ command: "sleep", cwd: "/", background: true });

    expect(await jobs.kill(id)).toBe(true);
    expect((await done).status).toBe("killed");
    expect(signals).toEqual(["SIGTERM"]);
  });
});
