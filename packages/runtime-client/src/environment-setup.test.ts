import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import type { SandboxExecOptions, SandboxRuntime } from "@anvia/sandbox";

import { runEnvironmentResume, runEnvironmentSetup } from "./environment-setup";

const ROOT = "/home/user/.aven/runtime/workspaces/t1";

const SETUP = "#!/usr/bin/env bash\nbun install --frozen-lockfile\n";

function fakeRuntime(options: {
  files?: Record<string, string>;
  result?: { stdout?: string; stderr?: string; exitCode?: number };
  status?: "exited" | "timed_out";
}) {
  const execs: SandboxExecOptions[] = [];
  const runtime = {
    async readFile({ path }: { path: string }) {
      const content = options.files?.[path];

      if (content === undefined) throw new Error("ENOENT");

      return new TextEncoder().encode(content);
    },
    async exec(execOptions: SandboxExecOptions) {
      execs.push(execOptions);
      const stdout = new TextEncoder().encode(options.result?.stdout ?? "ok\n");
      const stderr = new TextEncoder().encode(options.result?.stderr ?? "");

      if (options.status === "timed_out")
        return {
          status: "timed_out" as const,
          stdout,
          stderr,
          durationMs: 1,
          stdoutTruncated: false,
          stderrTruncated: false,
        };

      return {
        status: "exited" as const,
        exitCode: options.result?.exitCode ?? 0,
        stdout,
        stderr,
        durationMs: 1,
        stdoutTruncated: false,
        stderrTruncated: false,
      };
    },
  } as unknown as SandboxRuntime;
  return { runtime, execs };
}

describe("running .aven/setup", () => {
  test("runs the script with a clean environment, in the workspace, and digests it", async () => {
    const { runtime, execs } = fakeRuntime({
      files: { [`${ROOT}/.aven/setup`]: SETUP },
    });

    const setup = await runEnvironmentSetup({ runtime, root: ROOT });

    expect(setup.digest).toBe(createHash("sha256").update(SETUP).digest("hex"));
    expect(setup.output).toBe("ok");
    expect(execs).toHaveLength(1);
    expect(execs[0]).toMatchObject({ command: "sh", cwd: ROOT, timeoutMs: 20 * 60_000 });
    expect(execs[0]?.args).toEqual([
      "-c",
      'exec env -i HOME="$HOME" PATH="$PATH" CI=1 bash .aven/setup',
    ]);
  });

  test("says to write the script when there is none", async () => {
    const { runtime, execs } = fakeRuntime({});

    await expect(runEnvironmentSetup({ runtime, root: ROOT })).rejects.toThrow(
      "Write .aven/setup first",
    );
    expect(execs).toHaveLength(0);
  });

  test("fails with the end of the script's output when it fails", async () => {
    const { runtime } = fakeRuntime({
      files: { [`${ROOT}/.aven/setup`]: SETUP },
      result: { exitCode: 2, stdout: "step dependencies\n", stderr: "bun: not found\n" },
    });

    await expect(runEnvironmentSetup({ runtime, root: ROOT })).rejects.toThrow(
      ".aven/setup exited with 2:\nstep dependencies\nbun: not found",
    );
  });

  test("fails when the script does not finish in twenty minutes", async () => {
    const { runtime } = fakeRuntime({
      files: { [`${ROOT}/.aven/setup`]: SETUP },
      status: "timed_out",
    });

    await expect(runEnvironmentSetup({ runtime, root: ROOT })).rejects.toThrow(
      "did not finish within 20 minutes",
    );
  });
});

describe("running .aven/resume", () => {
  test("runs it in the workspace with the project's variables, and only when it is there", async () => {
    const missing = fakeRuntime({});
    expect(await runEnvironmentResume({ runtime: missing.runtime, root: ROOT, env: {} })).toBe(
      false,
    );
    expect(missing.execs).toHaveLength(0);

    const present = fakeRuntime({ files: { [`${ROOT}/.aven/resume`]: "echo hi\n" } });
    expect(
      await runEnvironmentResume({
        runtime: present.runtime,
        root: ROOT,
        env: { API_URL: "https://example.test" },
      }),
    ).toBe(true);
    expect(present.execs[0]).toMatchObject({
      command: "bash",
      args: [".aven/resume"],
      cwd: ROOT,
      env: { API_URL: "https://example.test" },
      timeoutMs: 10_000,
    });
  });

  test("a resume that fails is not a failed run", async () => {
    const { runtime } = fakeRuntime({
      files: { [`${ROOT}/.aven/resume`]: "exit 3\n" },
      result: { exitCode: 3 },
    });

    expect(await runEnvironmentResume({ runtime, root: ROOT, env: {} })).toBe(false);
  });
});
