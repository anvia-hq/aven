import { describe, expect, test } from "bun:test";
import type { SandboxRuntime } from "@anvia/sandbox";

import { envOf, withProjectEnv } from "./project-env";

function recording() {
  const calls: { method: string; env: unknown }[] = [];
  const sandbox = {
    id: "sandbox",
    workdir: "/workspace",
    exec: async (options: { env?: unknown }) => {
      calls.push({ method: "exec", env: options.env });
      return {};
    },
    execStream: (options: { env?: unknown }) => {
      calls.push({ method: "execStream", env: options.env });
      return [];
    },
    startProcess: async (options: { env?: unknown }) => {
      calls.push({ method: "startProcess", env: options.env });
      return {};
    },
    readTextFile: async () => "text",
  } as unknown as SandboxRuntime;
  return { calls, sandbox };
}

describe("withProjectEnv", () => {
  test("gives commands, streamed commands and processes the project's variables", async () => {
    const { calls, sandbox } = recording();
    const wrapped = withProjectEnv(sandbox, () => ({ DATABASE_URL: "postgres://x" }));

    await wrapped.exec({ command: "env" });
    wrapped.execStream({ command: "env" });
    await wrapped.startProcess({ command: "bun" });

    expect(calls).toEqual([
      { method: "exec", env: { DATABASE_URL: "postgres://x" } },
      { method: "execStream", env: { DATABASE_URL: "postgres://x" } },
      { method: "startProcess", env: { DATABASE_URL: "postgres://x" } },
    ]);
  });

  test("a variable the agent sets for one command wins over the project's", async () => {
    const { calls, sandbox } = recording();
    const wrapped = withProjectEnv(sandbox, () => ({ MODE: "dev", KEEP: "1" }));

    await wrapped.exec({ command: "env", env: { MODE: "test" } });

    expect(calls[0]!.env).toEqual({ MODE: "test", KEEP: "1" });
  });

  test("reads the variables when the command starts, so a new run's replace the last run's", async () => {
    const { calls, sandbox } = recording();
    let current: Record<string, string> | undefined = { A: "1" };
    const wrapped = withProjectEnv(sandbox, () => current);

    await wrapped.exec({ command: "env" });
    current = { B: "2" };
    await wrapped.exec({ command: "env" });
    current = undefined;
    await wrapped.exec({ command: "env", env: { C: "3" } });
    await wrapped.exec({ command: "env" });

    expect(calls.map((call) => call.env)).toEqual([{ A: "1" }, { B: "2" }, { C: "3" }, undefined]);
  });

  test("everything else is the runtime's own", async () => {
    const { sandbox } = recording();
    const wrapped = withProjectEnv(sandbox, () => ({ A: "1" }));

    expect(wrapped.workdir).toBe("/workspace");
    expect(await wrapped.readTextFile({ path: "x" })).toBe("text");
  });
});

describe("envOf", () => {
  test("turns a run's variables into an environment", () => {
    expect(
      envOf([
        { name: "A", value: "1" },
        { name: "B", value: "" },
      ]),
    ).toEqual({ A: "1", B: "" });
    expect(envOf(undefined)).toEqual({});
  });
});
