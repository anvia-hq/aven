import { describe, expect, test } from "bun:test";

import { RemoteSandbox } from "./remote-sandbox";
import type { MachineCall } from "./types";

const result = {
  stdout: "",
  stderr: "",
  status: "exited" as const,
  exitCode: 0,
  durationMs: 1,
  stdoutTruncated: false,
  stderrTruncated: false,
};

describe("a sandbox reached on another machine", () => {
  test("runs a command without an abort signal as it is", async () => {
    const seen: unknown[] = [];
    const call: MachineCall = async (op, args) => {
      seen.push({ op, args });
      return result;
    };
    const sandbox = new RemoteSandbox("t1", call, () => "/work");

    const ran = await sandbox.exec({ command: "true" });

    expect(seen).toEqual([{ op: "exec", args: { command: "true" } }]);
    expect(ran).toMatchObject({ status: "exited", exitCode: 0 });
  });

  test("asks the machine to stop the command when the run is cancelled", async () => {
    const seen: { op: string; args: unknown }[] = [];
    let release: (value: unknown) => void = () => undefined;
    let started: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const call: MachineCall = async (op, args) => {
      seen.push({ op, args });

      if (op === "exec.abort") return null;

      started();
      return new Promise((resolve) => {
        release = resolve;
      });
    };
    const sandbox = new RemoteSandbox("t1", call, () => "/work");
    const controller = new AbortController();
    const pending = sandbox.exec({
      command: "sleep 30",
      operationId: "run/cmd-1",
      abortSignal: controller.signal,
    });
    await ready;

    controller.abort();

    expect(seen).toEqual([
      { op: "exec", args: { command: "sleep 30", operationId: "run/cmd-1" } },
      { op: "exec.abort", args: { operationId: "run/cmd-1" } },
    ]);
    release(result);
    expect(await pending).toMatchObject({ status: "exited", exitCode: 0 });
  });

  test("gives a command an id when it has none, so a cancel can still name it", async () => {
    const seen: { op: string; args: { operationId?: string } }[] = [];
    const call: MachineCall = async (op, args) => {
      seen.push({ op, args: args as { operationId?: string } });
      return result;
    };
    const sandbox = new RemoteSandbox("t1", call, () => "/work");
    const controller = new AbortController();
    controller.abort();

    await sandbox.exec({ command: "sleep 30", abortSignal: controller.signal });

    const id = seen[1]?.args.operationId;
    expect(seen.map((entry) => entry.op)).toEqual(["exec.abort", "exec"]);
    expect(id).toEqual(expect.any(String));
    expect(id?.length).toBeGreaterThan(0);
    expect(seen[0]?.args.operationId).toBe(id);
  });

  test("a machine that cannot stop a command still returns what the command did", async () => {
    let release: (value: unknown) => void = () => undefined;
    let started: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const call: MachineCall = async (op) => {
      if (op === "exec.abort") throw new Error("Invalid parameters");

      started();
      return new Promise((resolve) => {
        release = resolve;
      });
    };
    const sandbox = new RemoteSandbox("t1", call, () => "/work");
    const controller = new AbortController();
    const pending = sandbox.exec({ command: "sleep 30", abortSignal: controller.signal });
    await ready;

    controller.abort();
    release(result);

    expect(await pending).toMatchObject({ status: "exited", exitCode: 0 });
  });
});
