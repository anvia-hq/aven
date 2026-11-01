import { afterEach, describe, expect, test } from "bun:test";

import { directoryWorkspaces } from "./testing/directory-workspaces";
import { secretRedactor } from "./secret-redaction";
import { processView, threadProcesses } from "./thread-processes";

const info = (command: string, args: string[]) => ({
  id: "p1",
  command,
  args,
  status: "running" as const,
  startedAt: "2026-11-01T10:00:00.000Z",
});

describe("how a process is named", () => {
  test("a shell's script is what the agent wrote, any other command is its command line", () => {
    expect(processView(info("sh", ["-c", "npm run dev"])).command).toBe("npm run dev");
    expect(processView(info("/bin/bash", ["-c", "tail -f log"])).command).toBe("tail -f log");
    expect(processView(info("npm", ["run", "dev"])).command).toBe("npm run dev");
    // Not the `-c script` shape: shown as it is.
    expect(processView(info("sh", ["./run.sh", "-c"])).command).toBe("sh ./run.sh -c");
  });

  test("keeps the status, the exit code and the times", () => {
    expect(
      processView({
        ...info("sleep", ["1"]),
        status: "exited",
        exitCode: 3,
        endedAt: "2026-11-01T10:00:01.000Z",
      }),
    ).toMatchObject({
      status: "exited",
      exitCode: 3,
      startedAt: "2026-11-01T10:00:00.000Z",
      endedAt: "2026-11-01T10:00:01.000Z",
    });
  });
});

describe("the processes of a thread's sandbox", () => {
  const workspaces = directoryWorkspaces();
  afterEach(() => workspaces.dispose());

  async function sandbox(isUp = () => true) {
    await workspaces.acquire({ id: "t1" });
    const runtime = workspaces.sandboxes.get("t1")!;
    return { runtime, processes: threadProcesses(runtime, isUp) };
  }

  test("lists what was started, reads what it printed and stops it", async () => {
    const { runtime, processes } = await sandbox();
    const started = await runtime.startProcess({
      command: "sh",
      args: ["-c", "echo ready; echo oops >&2; sleep 30"],
    });
    await Bun.sleep(300);

    expect(await processes.list()).toMatchObject([
      { id: started.id, command: "echo ready; echo oops >&2; sleep 30", status: "running" },
    ]);
    expect(await processes.logs(started.id)).toEqual({
      stdout: "ready\n",
      stderr: "oops\n",
      truncated: false,
    });

    expect(await processes.stop(started.id)).toMatchObject([{ id: started.id, status: "stopped" }]);
  });

  test("a process that is not there cannot be stopped or read", async () => {
    const { processes } = await sandbox();

    await expect(processes.stop("nope")).rejects.toThrow();
    await expect(processes.logs("nope")).rejects.toThrow();
  });

  test("a sandbox that is not up has no processes, and is not asked about them", async () => {
    const { runtime, processes } = await sandbox(() => false);
    await runtime.startProcess({ command: "sleep", args: ["30"] });

    expect(await processes.list()).toEqual([]);
    await expect(processes.stop("proc-1")).rejects.toThrow("The sandbox is not running");
    await expect(processes.logs("proc-1")).rejects.toThrow("The sandbox is not running");
  });

  test("what a person is shown hides the run's secrets, in the command and in the output", async () => {
    await workspaces.acquire({ id: "t1" });
    const runtime = workspaces.sandboxes.get("t1")!;
    const redact = secretRedactor([
      { name: "TOKEN", value: "s3cret-value-123", secret: true },
      { name: "MODE", value: "development-mode", secret: false },
    ]);
    const processes = threadProcesses(
      runtime,
      () => true,
      () => redact,
    );
    const started = await runtime.startProcess({
      command: "sh",
      args: ["-c", "echo s3cret-value-123 development-mode; sleep 30"],
    });
    await Bun.sleep(300);

    const [listed] = await processes.list();
    expect(listed?.command).toBe("echo [redacted] development-mode; sleep 30");
    const logs = await processes.logs(started.id);
    expect(logs.stdout).toBe("[redacted] development-mode\n");
    expect(JSON.stringify(await processes.stop(started.id))).not.toContain("s3cret");
  });
});
