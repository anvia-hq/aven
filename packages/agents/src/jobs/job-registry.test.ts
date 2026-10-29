import { describe, expect, test } from "bun:test";

import { JobRegistry, type Launcher } from "./job-registry";

const bytes = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
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
