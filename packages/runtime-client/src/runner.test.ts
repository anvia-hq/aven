import { afterEach, describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Agent, createQuestionTool, createTool, type CompletionRequest } from "@anvia/core";
import { scriptedModel, text, toolCall } from "@aven/agents/testing/scripted-model";
import { COMPACT_PROMPT, COMPACTED, createCompactionAgent } from "@aven/agents/compaction-agent";
import { createSendMessageTool } from "@aven/agents/tools/send-message";
import { z } from "zod";

import { startRuntime } from "./runner";
import { noProcesses } from "./thread-processes";
import { directoryWorkspaces } from "./testing/directory-workspaces";
import { goalSessionMarker } from "./goal-report";
import { fakeControlPlane } from "./testing/fake-control-plane";
import { gitFixture, sh } from "./testing/git-fixture";
import { journalPath } from "./testing/journal-path";
import type { ScriptStep } from "@aven/agents/types";
import type { ProcessView, RuntimeToControlPlane } from "@aven/protocol/types";
import type {
  CreateBotReplyAgent,
  CreateRuntimeAgent,
  ThreadSandbox,
  ThreadWorkspaces,
} from "./types";

const thread = { id: "thread-1", organizationId: "org-1" };
const runStart = { type: "run.start", runId: "run-1", thread, prompt: "hi" };

function slowSandbox() {
  const gate = Promise.withResolvers<void>();
  const released: string[] = [];
  const busy = { now: false };
  const sandbox: ThreadWorkspaces = {
    async acquire(): Promise<ThreadSandbox> {
      await gate.promise;
      return { tools: [], hasRunningProcesses: async () => busy.now, processes: noProcesses };
    },
    workspace: async () => undefined,
    async release(threadId) {
      released.push(threadId);
    },
    async dispose() {},
  };
  return { sandbox, up: gate.resolve, released, busy };
}

const agentThat =
  (...steps: ScriptStep[]): CreateRuntimeAgent =>
  ({ id }) => ({
    agent: new Agent({ id, model: scriptedModel(steps), instructions: "x" }),
  });

const reply = () => agentThat([text("ok")]);

const wakingReply =
  (): CreateRuntimeAgent =>
  ({ id, tools }) => ({
    agent: new Agent({
      id,
      tools: [...tools],
      model: scriptedModel([[toolCall("computer_wake", {})], [text("ok")]]),
      instructions: "x",
    }),
  });

const until = async (condition: () => boolean) => {
  for (let i = 0; i < 100 && !condition(); i++) await Bun.sleep(20);
  expect(condition()).toBe(true);
};

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function connect(
  options: Partial<Parameters<typeof startRuntime>[0]> & {
    sandbox: ThreadWorkspaces;
    storesTranscripts?: boolean;
  },
) {
  const { storesTranscripts, ...runtimeOptions } = options;
  const plane = fakeControlPlane({ storesTranscripts });
  const runtime = startRuntime({
    url: plane.url,
    token: "t",
    journalPath: journalPath(),
    ...runtimeOptions,
  });
  cleanups.push(() => runtime.stop(), plane.stop);
  return { plane, runtime };
}

describe("startRuntime updating itself (decision 0146)", () => {
  const ask = async (
    plane: ReturnType<typeof fakeControlPlane>,
    id: string,
    params: Record<string, unknown>,
  ) => {
    plane.send({ type: "call", id, method: "runner.update", params } as never);
    await until(() => plane.received.some((m) => m.type === "reply" && m.id === id));
    return plane.received.find((m) => m.type === "reply" && m.id === id);
  };

  test("says in hello that it can, only when it was given a way to", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const withUpdate = connect({ sandbox, update: () => undefined });
    await withUpdate.runtime.ready;
    await until(() => withUpdate.plane.received.some((m) => m.type === "hello"));
    expect(withUpdate.plane.received.find((m) => m.type === "hello")).toMatchObject({
      canUpdate: true,
    });

    const without = connect({ sandbox });
    await without.runtime.ready;
    await until(() => without.plane.received.some((m) => m.type === "hello"));
    expect(
      (without.plane.received.find((m) => m.type === "hello") as { canUpdate?: boolean }).canUpdate,
    ).toBeUndefined();
    expect(await ask(without.plane, "u0", {})).toMatchObject({
      ok: true,
      result: { status: "unsupported" },
    });
  });

  test("agrees when it is quiet, answers before it starts, and starts with the release", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const started: (string | undefined)[] = [];
    const { plane, runtime } = connect({ sandbox, update: (release) => started.push(release) });
    await runtime.ready;

    const reply = await ask(plane, "u1", { release: "1.2.3" });
    expect(reply).toMatchObject({ ok: true, result: { status: "started" } });
    expect(started).toEqual([]);
    await until(() => started.length > 0);
    expect(started).toEqual(["1.2.3"]);

    expect(await ask(plane, "u2", { release: "1.2.3; rm -rf /" })).toMatchObject({ ok: false });
    await Bun.sleep(1200);
    expect(started).toEqual(["1.2.3"]);
  });

  test("refuses while a run is going, and does not start", async () => {
    const { sandbox, up } = slowSandbox();
    const started: unknown[] = [];
    const { plane, runtime } = connect({
      sandbox,
      update: (release) => started.push(release),
      createAgent: agentThat([text("working")]),
    });
    await runtime.ready;
    plane.send(runStart);
    await Bun.sleep(100);
    expect(await ask(plane, "u3", {})).toMatchObject({
      ok: true,
      result: { status: "busy", reason: expect.stringContaining("run is going") },
    });
    await Bun.sleep(1200);
    expect(started).toEqual([]);
    up();
  });
});

describe("startRuntime putting a thread away", () => {
  test("a sandbox release, which only an archived thread gets, tells the workspaces", async () => {
    const workspaces = directoryWorkspaces();
    cleanups.push(() => workspaces.dispose());
    const putAway: string[] = [];
    const { plane, runtime } = connect({
      sandbox: { ...workspaces, putAway: async (threadId: string) => void putAway.push(threadId) },
    });
    await runtime.ready;

    plane.send({
      type: "call",
      id: "r",
      method: "sandbox.release",
      params: { threadId: "t1" },
    } as never);
    await until(() => plane.received.some((m) => m.type === "reply" && m.id === "r"));

    expect(putAway).toEqual(["t1"]);
  });
});

describe("startRuntime processes", () => {
  test("lists, reads and stops the processes of a thread's sandbox, and never starts one", async () => {
    const workspaces = directoryWorkspaces();
    cleanups.push(() => workspaces.dispose());
    const { plane, runtime } = connect({ sandbox: workspaces });
    await runtime.ready;
    const ask = async (id: string, method: string, params: object) => {
      plane.send({ type: "call", id, method, params } as never);
      await until(() => plane.received.some((m) => m.type === "reply" && m.id === id));
      return plane.received.find((m) => m.type === "reply" && m.id === id);
    };

    expect(await ask("a", "processes.list", { threadId: "t1" })).toMatchObject({
      ok: true,
      result: { processes: [] },
    });
    expect(workspaces.sandboxes.size).toBe(0);
    expect(await ask("b", "processes.stop", { threadId: "t1", processId: "x" })).toMatchObject({
      ok: false,
    });

    await ask("w", "computer.wake", { threadId: "t1" });
    const started = await workspaces.sandboxes
      .get("t1")!
      .startProcess({ command: "sh", args: ["-c", "echo up; sleep 30"] });
    await Bun.sleep(300);

    expect(await ask("c", "processes.list", { threadId: "t1" })).toMatchObject({
      result: { processes: [{ id: started.id, command: "echo up; sleep 30", status: "running" }] },
    });
    expect(
      await ask("d", "processes.logs", { threadId: "t1", processId: started.id }),
    ).toMatchObject({ result: { stdout: "up\n", stderr: "", truncated: false } });
    expect(
      await ask("e", "processes.stop", { threadId: "t1", processId: started.id }),
    ).toMatchObject({ result: { processes: [{ id: started.id, status: "stopped" }] } });
    expect(await ask("f", "processes.stop", { threadId: "t1", processId: "nope" })).toMatchObject({
      ok: false,
    });
    expect(await ask("g", "processes.list", { threadId: 7 })).toMatchObject({
      ok: false,
      error: "Invalid parameters",
    });
  });

  test("runs an action's command in the sandbox, waking it, and lists it as a process", async () => {
    const workspaces = directoryWorkspaces();
    cleanups.push(() => workspaces.dispose());
    const { plane } = connect({ sandbox: workspaces });
    await until(() => plane.received.some((m) => m.type === "hello"));
    const ask = async (id: string, method: string, params: object) => {
      plane.send({ type: "call", id, method, params } as never);
      await until(() => plane.received.some((m) => m.type === "reply" && m.id === id));
      return plane.received.find((m) => m.type === "reply" && m.id === id);
    };

    const reply = await ask("a", "actions.run", { threadId: "t1", command: "echo tested" });
    expect(reply).toMatchObject({
      ok: true,
      result: { process: { command: "echo tested", status: "running" } },
    });
    await Bun.sleep(300);
    const process = (reply as { result: { process: { id: string } } }).result.process;
    expect(
      await ask("b", "processes.logs", { threadId: "t1", processId: process.id }),
    ).toMatchObject({ result: { stdout: "tested\n" } });
    expect(await ask("c", "actions.run", { threadId: "t1", command: "  " })).toMatchObject({
      ok: false,
      error: "Invalid parameters",
    });
  });
});

describe("startRuntime host stats", () => {
  test("tells the control plane how loaded the machine is, as soon as it connects and again after", async () => {
    const workspaces = directoryWorkspaces();
    cleanups.push(() => workspaces.dispose());
    const { plane, runtime } = connect({
      sandbox: { ...workspaces, running: () => 2 },
      statsIntervalMs: 50,
    });
    await runtime.ready;
    const stats = () => plane.received.filter((m) => m.type === "host.stats");

    await until(() => stats().length >= 2);

    expect(stats()[0]).toMatchObject({
      type: "host.stats",
      stats: { sandboxes: 2, cores: expect.any(Number), diskTotalBytes: expect.any(Number) },
    });
  });

  test("stops telling once the runner stops, not leaving its timer behind", async () => {
    const workspaces = directoryWorkspaces();
    cleanups.push(() => workspaces.dispose());
    const { plane, runtime } = connect({ sandbox: workspaces, statsIntervalMs: 30 });
    await runtime.ready;
    const stats = () => plane.received.filter((m) => m.type === "host.stats");
    await until(() => stats().length >= 2);

    await runtime.stop();
    const sent = stats().length;
    await Bun.sleep(200);

    expect(stats().length).toBe(sent);
  });
});

describe("startRuntime computers", () => {
  const withDesktop = (_desktop?: unknown) => slowSandbox();

  test("wakes a thread's sandbox without a run, answers that it is awake, and frees it when idle", async () => {
    const { sandbox, up, released } = withDesktop();
    const acquired: string[] = [];
    const counting: ThreadWorkspaces = {
      ...sandbox,
      acquire: async (thread, repo) => (acquired.push(thread.id), sandbox.acquire(thread, repo)),
    };
    const { plane, runtime } = connect({ sandbox: counting, idleReleaseMs: 50 });
    await runtime.ready;
    up();

    plane.send({ type: "call", id: "w1", method: "computer.wake", params: { threadId: "t1" } });

    await until(() => plane.received.some((message) => message.type === "reply"));
    expect(plane.received.find((message) => message.type === "reply")).toMatchObject({
      ok: true,
      result: { state: "awake" },
    });
    expect(acquired).toEqual(["t1"]);
    await until(() => released.length === 1);
    expect(released).toEqual(["t1"]);
  });

  test("wakes a bot's computer with no repository, and starts its container", async () => {
    const { sandbox, up } = withDesktop();
    const acquired: { id: string; repo: unknown }[] = [];
    const starts: string[] = [];
    const lazy: ThreadWorkspaces = {
      ...sandbox,
      acquire: async (thread, repo) => {
        acquired.push({ id: thread.id, repo });
        const box = await sandbox.acquire(thread, repo);
        return { ...box, start: async () => void starts.push(thread.id) };
      },
    };
    const { plane, runtime } = connect({ sandbox: lazy });
    await runtime.ready;
    up();

    plane.send({
      type: "call",
      id: "w1",
      method: "computer.wake",
      params: { threadId: "bot-1", bot: true },
    });

    await until(() => plane.received.some((message) => message.type === "reply"));
    expect(plane.received.find((message) => message.type === "reply")).toMatchObject({
      ok: true,
      result: { state: "awake" },
    });
    expect(acquired).toEqual([{ id: "bot-1", repo: undefined }]);
    expect(starts).toEqual(["bot-1"]);
  });

  test("a thread with no workspace is not woken: the clone is made by a run", async () => {
    const { sandbox, up } = withDesktop(undefined);
    const unclonedSandbox: ThreadWorkspaces = {
      ...sandbox,
      acquire: async (thread, repo) => (await repo?.(), sandbox.acquire(thread, repo)),
    };
    const { plane, runtime } = connect({ sandbox: unclonedSandbox });
    await runtime.ready;
    up();

    plane.send({ type: "call", id: "w2", method: "computer.wake", params: { threadId: "t1" } });

    await until(() => plane.received.some((message) => message.type === "reply"));
    expect(plane.received.find((message) => message.type === "reply")).toMatchObject({
      ok: false,
      error: "The thread has no workspace yet",
    });
  });
});

describe("startRuntime", () => {
  test("the agent's git_fetch brings a branch into the workspace through the host, with the run's own repo access", async () => {
    const fixture = await gitFixture();
    cleanups.push(fixture.cleanup);
    const sandbox: ThreadWorkspaces = {
      async acquire(): Promise<ThreadSandbox> {
        return { tools: [], hasRunningProcesses: async () => false, processes: noProcesses };
      },
      workspace: async () => fixture.root,
      async release() {},
      async dispose() {},
    };
    const { plane, runtime } = connect({
      sandbox,
      createAgent: ({ id, tools }) => ({
        agent: new Agent({
          id,
          instructions: "x",
          tools: [...tools],
          model: scriptedModel([
            [
              {
                type: "tool-call",
                toolCallId: "f1",
                toolName: "git_fetch",
                input: { branch: "other" },
              },
            ],
            [text("fetched")],
          ]),
        }),
      }),
    });
    await runtime.ready;
    plane.send(runStart);

    await until(() => plane.received.some((message) => message.type === "call"));
    const call = plane.received.find((message) => message.type === "call");
    expect(call).toMatchObject({ method: "repo.access", params: { runId: "run-1" } });
    plane.send({
      type: "reply",
      id: (call as { id: string }).id,
      ok: true,
      result: fixture.access,
    });

    await until(() => plane.received.some((message) => message.type === "run.end"));
    expect(await sh(fixture.root, "show", "origin/other:b.txt")).toBe("other");
    expect(await sh(fixture.root, "rev-parse", "--abbrev-ref", "HEAD")).toBe("aven/test");
    const ended = plane.received.find((message) => message.type === "run.end");
    expect(ended).toMatchObject({ outcome: "response" });
    expect(JSON.stringify(plane.received)).not.toContain("secret-token");
    expect(await Bun.file(`${fixture.root}/.git/config`).text()).not.toContain("secret-token");
  });

  describe("signing the sandbox in to GitHub for a run (decision 0044)", () => {
    const ada = { token: "ghu_very-secret", id: 42, login: "ada", name: "Ada L" };

    function signingSandbox(options: { failSignIn?: boolean } = {}) {
      const signedIn: { threadId: string; github: unknown }[] = [];
      const identities: { threadId: string; identity: unknown; controlPlane: string }[] = [];
      const sandbox: ThreadWorkspaces = {
        async acquire(): Promise<ThreadSandbox> {
          return { tools: [], hasRunningProcesses: async () => false, processes: noProcesses };
        },
        workspace: async () => undefined,
        async signInGithub(threadId, github) {
          signedIn.push({ threadId, github });
          if (options.failSignIn) throw new Error("no shell");
        },
        async signInIdentity(threadId, identity, controlPlane) {
          identities.push({ threadId, identity, controlPlane });
        },
        async release() {},
        async dispose() {},
      };
      return { sandbox, signedIn, identities };
    }

    test("a runner that restarts signs the run in again with the secrets the control plane attaches", async () => {
      const { sandbox, signedIn } = signingSandbox();
      const paths = { journalPath: journalPath() };
      const hold = Promise.withResolvers<void>();
      const reached = Promise.withResolvers<void>();
      const first = connect({
        sandbox,
        ...paths,
        createAgent: ({ id, tools }) => ({
          agent: new Agent({
            id,
            instructions: "x",
            tools: [...tools],
            model: scriptedModel([
              [toolCall("computer_wake", {})],
              async () => {
                reached.resolve();
                await hold.promise;
                return [text("never")];
              },
            ]),
          }),
        }),
      });
      await first.runtime.ready;
      first.plane.send({ ...runStart, runId: "run-a", github: ada });
      await reached.promise;
      const stopping = first.runtime.stop();
      hold.resolve();
      await stopping;

      const second = connect({ sandbox, ...paths, createAgent: wakingReply() });
      await second.runtime.ready;
      await until(() => second.plane.received.some((m) => m.type === "hello"));
      second.plane.send({
        type: "run.attach",
        runId: "run-a",
        after: 0,
        secrets: { github: ada },
      });
      await until(() => second.plane.received.some((m) => m.type === "run.end"));
      expect(signedIn.map((entry) => entry.github)).toEqual([ada, ada]);
    });

    test("a run signs in as the account it came with, and a run with none signs out", async () => {
      const { sandbox, signedIn } = signingSandbox();
      const { plane, runtime } = connect({ sandbox, createAgent: wakingReply() });
      await runtime.ready;

      plane.send({ ...runStart, runId: "run-a", github: ada });
      await until(() => plane.received.some((m) => m.type === "run.end" && m.runId === "run-a"));
      plane.send({ ...runStart, runId: "run-b" });
      await until(() => plane.received.some((m) => m.type === "run.end" && m.runId === "run-b"));

      expect(signedIn).toEqual([
        { threadId: "thread-1", github: ada },
        { threadId: "thread-1", github: undefined },
      ]);
    });

    test("a run signs in to mint identity tokens with the credential it came with, at the control plane's origin", async () => {
      const { sandbox, identities } = signingSandbox();
      const { plane, runtime } = connect({ sandbox, createAgent: wakingReply() });
      await runtime.ready;

      plane.send({ ...runStart, runId: "run-a", identity: { credential: "avid_a" } });
      await until(() => plane.received.some((m) => m.type === "run.end" && m.runId === "run-a"));
      plane.send({ ...runStart, runId: "run-b" });
      await until(() => plane.received.some((m) => m.type === "run.end" && m.runId === "run-b"));

      const controlPlane = plane.url.replace("ws://", "http://");
      expect(identities).toEqual([
        { threadId: "thread-1", identity: { credential: "avid_a" }, controlPlane },
        { threadId: "thread-1", identity: undefined, controlPlane },
      ]);
    });

    test("a sign-in that fails does not fail the run", async () => {
      const { sandbox } = signingSandbox({ failSignIn: true });
      const silenced = console.warn;
      console.warn = () => undefined;
      const { plane, runtime } = connect({ sandbox, createAgent: reply() });
      await runtime.ready;

      plane.send({ ...runStart, github: ada });

      await until(() => plane.received.some((message) => message.type === "run.end"));
      console.warn = silenced;
      expect(plane.received.find((message) => message.type === "run.end")).toMatchObject({
        outcome: "response",
      });
    });

    test("the token is in memory only: no file in the runner's data folder holds it", async () => {
      const { sandbox } = signingSandbox();
      const journal = journalPath();
      const { plane, runtime } = connect({ sandbox, createAgent: reply(), journalPath: journal });
      await runtime.ready;

      plane.send({ ...runStart, github: ada });
      await until(() => plane.received.some((message) => message.type === "run.end"));
      plane.send({ type: "run.ack", runId: "run-1" });
      await Bun.sleep(100);

      const folder = dirname(journal);
      const files = await readdir(folder);
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const bytes = await Bun.file(join(folder, file)).text();
        expect(bytes).not.toContain("ghu_very-secret");
      }
    });
  });

  describe("giving the agent's commands the project's variables (decision 0045)", () => {
    const env = [{ name: "DATABASE_URL", value: "postgres://very-secret" }];

    function envSandbox() {
      const given: { threadId: string; env: unknown }[] = [];
      const sandbox: ThreadWorkspaces = {
        async acquire(): Promise<ThreadSandbox> {
          return { tools: [], hasRunningProcesses: async () => false, processes: noProcesses };
        },
        workspace: async () => undefined,
        setProjectEnv(threadId, variables) {
          given.push({ threadId, env: variables });
        },
        async release() {},
        async dispose() {},
      };
      return { sandbox, given };
    }

    test("a run sets the variables it came with, and a run with none clears them", async () => {
      const { sandbox, given } = envSandbox();
      const { plane, runtime } = connect({ sandbox, createAgent: wakingReply() });
      await runtime.ready;

      plane.send({ ...runStart, runId: "run-a", env });
      await until(() => plane.received.some((m) => m.type === "run.end" && m.runId === "run-a"));
      plane.send({ ...runStart, runId: "run-b" });
      await until(() => plane.received.some((m) => m.type === "run.end" && m.runId === "run-b"));

      expect(given).toEqual([
        { threadId: "thread-1", env },
        { threadId: "thread-1", env: undefined },
      ]);
    });

    test("the agent is told their names, and nothing it is built from holds a value", async () => {
      const { sandbox } = envSandbox();
      const built: unknown[] = [];
      const inner = reply();
      const { plane, runtime } = connect({
        sandbox,
        createAgent: (input) => {
          built.push(input);
          return inner(input);
        },
      });
      await runtime.ready;

      plane.send({ ...runStart, env });
      await until(() => plane.received.some((message) => message.type === "run.end"));

      expect(built).toHaveLength(1);
      expect(built[0]).toMatchObject({ envNames: ["DATABASE_URL"] });
      expect(JSON.stringify(built)).not.toContain("very-secret");
    });

    test("a secret a command prints never reaches the control plane; a plain variable does", async () => {
      const exec = createTool({
        name: "exec_command",
        description: "Runs a command",
        inputSchema: z.object({}),
        execute: async () => ({ stdout: "DB=postgres://very-secret-value MODE=development-mode" }),
      });
      const { sandbox } = envSandbox();
      const { plane, runtime } = connect({
        sandbox: {
          ...sandbox,
          acquire: async () => ({
            tools: [exec],
            hasRunningProcesses: async () => false,
            processes: noProcesses,
          }),
        },
        createAgent: ({ id, tools }) => ({
          agent: new Agent({
            id,
            instructions: "x",
            tools: [...tools],
            model: scriptedModel([
              [{ type: "tool-call", toolCallId: "c1", toolName: "exec_command", input: {} }],
              [text("done")],
            ]),
          }),
        }),
      });
      await runtime.ready;

      plane.send({
        ...runStart,
        env: [
          { name: "DATABASE_URL", value: "postgres://very-secret-value", secret: true },
          { name: "MODE", value: "development-mode" },
        ],
      });
      await until(() => plane.received.some((message) => message.type === "run.end"));

      const sent = JSON.stringify(plane.received);
      expect(sent).not.toContain("very-secret-value");
      expect(sent).toContain("[redacted]");
      expect(sent).toContain("development-mode");
    });

    test("they are in memory only: no file in the runner's data folder holds them", async () => {
      const { sandbox } = envSandbox();
      const journal = journalPath();
      const { plane, runtime } = connect({ sandbox, createAgent: reply(), journalPath: journal });
      await runtime.ready;

      plane.send({ ...runStart, env });
      await until(() => plane.received.some((message) => message.type === "run.end"));
      plane.send({ type: "run.ack", runId: "run-1" });
      await Bun.sleep(100);

      const folder = dirname(journal);
      const files = await readdir(folder);
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const bytes = await Bun.file(join(folder, file)).text();
        expect(bytes).not.toContain("very-secret");
      }
    });
  });

  test("the agent keeps notes through the control plane, told of them in its instructions, with the run's secrets hidden (decision 0102)", async () => {
    const memory = {
      folders: [
        { scope: "project" as const, notes: [{ name: "staging.md", description: "Shared" }] },
        { scope: "personal" as const, notes: [] },
      ],
      writable: true,
    };
    const built: Parameters<CreateRuntimeAgent>[0][] = [];
    const sandbox: ThreadWorkspaces = {
      async acquire(): Promise<ThreadSandbox> {
        return { tools: [], hasRunningProcesses: async () => false, processes: noProcesses };
      },
      workspace: async () => undefined,
      async release() {},
      async dispose() {},
    };
    const { plane, runtime } = connect({
      sandbox,
      createAgent: (input) => {
        built.push(input);
        return {
          agent: new Agent({
            id: input.id,
            instructions: "x",
            tools: [...input.tools],
            model: scriptedModel([
              [
                {
                  type: "tool-call",
                  toolCallId: "m1",
                  toolName: "memory",
                  input: {
                    command: "create",
                    path: "/memories/project/db.md",
                    file_text: "The database is postgres://very-secret-value",
                  },
                },
              ],
              [text("done")],
            ]),
          }),
        };
      },
    });
    await runtime.ready;
    plane.send({
      ...runStart,
      memory,
      env: [{ name: "DATABASE_URL", value: "postgres://very-secret-value", secret: true }],
    });

    const asked = () =>
      plane.received.find(
        (message) => message.type === "call" && message.method === "memory.notes",
      );
    await until(() => asked() !== undefined);
    const call = asked() as { id: string; params: unknown };
    expect(call.params).toEqual({
      runId: "run-1",
      command: {
        command: "create",
        path: "/memories/project/db.md",
        fileText: "The database is [redacted]",
      },
    });
    plane.send({ type: "reply", id: call.id, ok: true, result: "Saved /memories/project/db.md." });
    await until(() => plane.received.some((message) => message.type === "run.end"));

    expect(built[0]?.memory).toEqual(memory);
    expect(built[0]?.tools.map((tool) => tool.name)).toContain("memory");
    expect(JSON.stringify(plane.received)).toContain("Saved /memories/project/db.md.");
  });

  test("a run without memory has no memory tool", async () => {
    const built: Parameters<CreateRuntimeAgent>[0][] = [];
    const sandbox = directoryWorkspaces();
    cleanups.push(() => sandbox.dispose());
    const inner = reply();
    const { plane, runtime } = connect({
      sandbox,
      createAgent: (input) => (built.push(input), inner(input)),
    });
    await runtime.ready;
    plane.send(runStart);
    await until(() => plane.received.some((message) => message.type === "run.end"));
    expect(built[0]?.tools.map((tool) => tool.name)).not.toContain("memory");
    expect(built[0]?.memory).toBeUndefined();
  });

  test("a run whose history grows past a megabyte, as screenshots and command output make it, does not end", async () => {
    const screenshot = createTool({
      name: "screenshot",
      description: "A big result",
      inputSchema: z.object({}),
      execute: async () => ({ png: "A".repeat(450_000) }),
    });
    const { sandbox } = slowSandbox();
    const { plane, runtime } = connect({
      sandbox: {
        ...sandbox,
        acquire: async () => ({
          tools: [],
          hasRunningProcesses: async () => false,
          processes: noProcesses,
        }),
      },
      createAgent: ({ id }) => ({
        agent: new Agent({
          id,
          instructions: "x",
          tools: [screenshot],
          model: scriptedModel([
            ...Array.from({ length: 4 }, (_, i) => [
              {
                type: "tool-call" as const,
                toolCallId: `s${i}`,
                toolName: "screenshot",
                input: {},
              },
            ]),
            [text("done")],
          ]),
        }),
      }),
    });
    await runtime.ready;
    plane.send(runStart);
    await Bun.sleep(0);

    await until(() => plane.received.some((message) => message.type === "run.end"));
    expect(plane.received.find((message) => message.type === "run.end")).toMatchObject({
      outcome: "response",
    });
  });

  test("the sandbox gets the repository's access by asking the control plane about the run", async () => {
    const access = {
      cloneUrl: "https://github.com/acme/web.git",
      defaultBranch: "main",
      token: "t",
    };
    let given: unknown;
    const sandbox: ThreadWorkspaces = {
      async acquire(_thread, repo): Promise<ThreadSandbox> {
        given = await repo?.();
        return { tools: [], hasRunningProcesses: async () => false, processes: noProcesses };
      },
      workspace: async () => undefined,
      async release() {},
      async dispose() {},
    };
    const { plane, runtime } = connect({ sandbox, createAgent: reply() });
    await runtime.ready;
    plane.send(runStart);

    await until(() => plane.received.some((message) => message.type === "call"));
    const call = plane.received.find((message) => message.type === "call");
    expect(call).toMatchObject({ method: "repo.access", params: { runId: "run-1" } });
    plane.send({ type: "reply", id: (call as { id: string }).id, ok: true, result: access });

    await until(() => given !== undefined);
    expect(given).toEqual(access);
  });

  test("a run's skills are fetched from the control plane, put in /skills and given to the agent", async () => {
    const sandbox = directoryWorkspaces();
    cleanups.push(() => sandbox.dispose());
    const digest = "d".repeat(64);
    const archive = await new Bun.Archive(
      { "SKILL.md": "---\nname: notes\ndescription: Take notes.\n---\nSteps." },
      { compress: "gzip" },
    ).bytes();
    let told: unknown;
    const { plane, runtime } = connect({
      sandbox,
      createAgent: (input) => {
        told = input.skills;
        return reply()(input);
      },
    });
    await runtime.ready;
    plane.send({ ...runStart, skills: [{ name: "notes", description: "Take notes.", digest }] });

    const asked = () =>
      plane.received.find((message) => message.type === "call" && message.method === "skills.get");
    await until(() => asked() !== undefined);
    const call = asked() as { id: string; params: unknown };
    expect(call.params).toEqual({ runId: "run-1", digest });
    plane.send({ type: "reply", id: call.id, ok: true, result: { data: archive.toBase64() } });

    await until(() => told !== undefined);
    expect(told).toEqual([
      { name: "notes", description: "Take notes.", path: "/skills/notes/SKILL.md" },
    ]);
    expect(
      await Bun.file(join(await sandbox.skills.dir(thread.id), "notes/SKILL.md")).text(),
    ).toContain("name: notes");
  });

  test("a cancel that arrives while the sandbox is still starting ends the run before it begins", async () => {
    const { sandbox, up } = slowSandbox();
    let created = false;
    const { plane, runtime } = connect({
      sandbox,
      createAgent: (input) => {
        created = true;
        return reply()(input);
      },
    });
    await runtime.ready;
    plane.send(runStart);
    await Bun.sleep(50);
    plane.send({ type: "run.cancel", runId: "run-1", reason: "stopped by the user" });
    await Bun.sleep(50);
    up();

    await until(() => plane.received.some((message) => message.type === "run.end"));
    expect(plane.received.find((message) => message.type === "run.end")).toMatchObject({
      outcome: "error",
      error: "stopped by the user",
    });
    expect(created).toBe(false);
  });

  test("a transcript the control plane never takes fails the run with a clear error", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const { plane, runtime } = connect({
      sandbox,
      callTimeoutMs: 100,
      storesTranscripts: false,
      createAgent: reply(),
    });
    await runtime.ready;
    plane.send(runStart);

    await until(() => plane.received.some((message) => message.type === "run.end"));
    const end = plane.received.find((message) => message.type === "run.end");
    expect(end).toMatchObject({ outcome: "error" });
    expect(end && "error" in end ? end.error : "").toContain("did not answer memory.append");
  });

  test("a thread with nothing running gives up its sandbox after the idle time", async () => {
    const { sandbox, up, released } = slowSandbox();
    up();
    const { plane, runtime } = connect({
      sandbox,
      idleReleaseMs: 50,
      createAgent: reply(),
    });
    await runtime.ready;
    plane.send(runStart);

    await until(() => released.includes("thread-1"));
    expect(plane.received.some((message) => message.type === "run.end")).toBe(true);
  });

  test("a thread whose sandbox still has a running process keeps it until the process ends", async () => {
    const { sandbox, up, released, busy } = slowSandbox();
    up();
    busy.now = true;
    const { plane, runtime } = connect({
      sandbox,
      idleReleaseMs: 40,
      createAgent: reply(),
    });
    await runtime.ready;
    plane.send(runStart);
    await until(() => plane.received.some((message) => message.type === "run.end"));

    await Bun.sleep(250);
    expect(released).toEqual([]);

    busy.now = false;
    await until(() => released.includes("thread-1"));
  });

  test("tells the control plane when a process the run left running ends while the thread is idle (decision 0144)", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    let list: ProcessView[] = [
      {
        id: "p1",
        command: "bun test",
        status: "running",
        startedAt: new Date(Date.now() + 1000).toISOString(),
      },
    ];
    const acquire = sandbox.acquire.bind(sandbox);
    sandbox.acquire = async (...args) => ({
      ...(await acquire(...args)),
      processes: {
        start: async () => list[0]!,
        list: async () => list,
        stop: async () => list,
        logs: async () => ({ stdout: "7 pass", stderr: "", truncated: false }),
      },
    });
    const { plane, runtime } = connect({ sandbox, createAgent: reply(), processPollMs: 20 });
    await runtime.ready;
    plane.send(runStart);
    await until(() => plane.received.some((message) => message.type === "run.end"));
    expect(plane.received.some((message) => message.type === "process.ended")).toBe(false);

    list = [
      {
        ...list[0]!,
        status: "exited",
        exitCode: 0,
        endedAt: new Date(Date.now() + 11_000).toISOString(),
      },
    ];
    await until(() => plane.received.some((message) => message.type === "process.ended"));
    expect(plane.received.find((message) => message.type === "process.ended")).toMatchObject({
      threadId: "thread-1",
      processId: "p1",
      exitCode: 0,
      stdout: "7 pass",
    });
  });

  test("a run that starts while the idle check is asking keeps the sandbox", async () => {
    const { sandbox, up, released } = slowSandbox();
    up();
    const asking = Promise.withResolvers<void>();
    const hold = Promise.withResolvers<void>();
    const asked = Promise.withResolvers<void>();
    const checking: ThreadWorkspaces = {
      ...sandbox,
      acquire: async () => ({
        tools: [],
        hasRunningProcesses: async () => {
          asked.resolve();
          await asking.promise;
          return false;
        },
        processes: noProcesses,
      }),
    };
    let runs = 0;
    const { plane, runtime } = connect({
      sandbox: checking,
      idleReleaseMs: 30,
      createAgent: (input) =>
        ++runs === 1
          ? reply()(input)
          : agentThat(async () => {
              await hold.promise;
              return [text("ok")];
            })(input),
    });
    await runtime.ready;
    plane.send(runStart);
    await asked.promise;

    plane.send({ ...runStart, runId: "run-2" });
    await Bun.sleep(50);
    asking.resolve();
    await Bun.sleep(100);
    expect(released).toEqual([]);
    hold.resolve();
  });
});

describe("startRuntime runs", () => {
  const hellos = (plane: ReturnType<typeof fakeControlPlane>) =>
    plane.received.filter((message) => message.type === "hello");
  const ended = (plane: ReturnType<typeof fakeControlPlane>) =>
    plane.received.filter((message) => message.type === "run.end");
  const appended = (plane: ReturnType<typeof fakeControlPlane>) =>
    plane.received.flatMap((message) =>
      message.type === "call" && message.method === "memory.append"
        ? [message.params as { turn: number; messages: { role: string }[] }]
        : [],
    );

  test("a run reports its progress as events and hands its messages home", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const lookup = createTool({
      name: "lookup",
      description: "Looks something up",
      inputSchema: z.object({ key: z.string() }),
      execute: ({ key }) => `value of ${key}`,
    });
    const { plane, runtime } = connect({
      sandbox,
      createAgent: ({ id }) => ({
        agent: new Agent({
          id,
          instructions: "x",
          tools: [lookup],
          model: scriptedModel([
            [text("looking"), toolCall("lookup", { key: "a" }, "call-1")],
            [text("found it")],
          ]),
        }),
      }),
    });
    await runtime.ready;
    plane.send(runStart);

    await until(() => ended(plane).length === 1);
    expect(ended(plane)[0]).toMatchObject({ outcome: "response" });
    const events = plane.received.flatMap((m) => (m.type === "run.event" ? [m.event] : []));
    expect(events.map((event) => event.type)).toEqual([
      "text",
      "tool_start",
      "usage",
      "tool_end",
      "text",
      "usage",
    ]);
    expect(events.find((event) => event.type === "tool_end")).toMatchObject({
      id: "call-1",
      status: "done",
      output: "value of a",
    });
    const [transcript] = appended(plane);
    expect(transcript?.turn).toBe(0);
    expect(transcript?.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
  });

  test("a run that only compacts summarizes the history without starting the thread's sandbox (decision 0097)", async () => {
    const workspaces = directoryWorkspaces();
    cleanups.push(() => workspaces.dispose());
    let acquired = 0;
    const sandbox: ThreadWorkspaces = {
      ...workspaces,
      acquire: (...args) => {
        acquired++;
        return workspaces.acquire(...args);
      },
    };
    const { plane, runtime } = connect({
      sandbox,
      createAgent: ({ id, compact }) =>
        compact
          ? createCompactionAgent({ id, model: scriptedModel([[text("They said hello.")]]) })
          : {
              agent: new Agent({
                id,
                model: scriptedModel([[text("hello back")]]),
                instructions: "x",
              }),
            },
    });
    await runtime.ready;
    plane.send(runStart);
    await until(() => ended(plane).length === 1);
    expect(acquired).toBe(1);

    plane.send({ ...runStart, runId: "run-2", prompt: COMPACT_PROMPT, compact: true });
    await until(() => ended(plane).length === 2);
    expect(ended(plane)[1]).toMatchObject({ outcome: "response" });
    expect(acquired).toBe(1);
    const [, filed] = appended(plane);
    expect(filed?.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(JSON.stringify(filed?.messages.at(-1))).toContain(COMPACTED);
  });

  describe("a message sent while the run goes on (decision 0098)", () => {
    const steer = async (
      plane: ReturnType<typeof fakeControlPlane>,
      id: string,
      params: Record<string, unknown>,
    ) => {
      plane.send({ type: "call", id, method: "run.steer", params } as never);
      await until(() => plane.received.some((m) => m.type === "reply" && m.id === id));
      return plane.received.find((m) => m.type === "reply" && m.id === id);
    };
    const slowTool = (gate: Promise<void>) =>
      createTool({
        name: "slow",
        description: "Takes a while",
        inputSchema: z.object({}),
        execute: async () => {
          await gate;
          return "done";
        },
      });
    const events = (plane: ReturnType<typeof fakeControlPlane>) =>
      plane.received.flatMap((m) => (m.type === "run.event" ? [m.event] : []));

    test("is taken at the agent's next step, reported, and filed in the transcript", async () => {
      const { sandbox, up } = slowSandbox();
      up();
      const gate = Promise.withResolvers<void>();
      const seen: string[] = [];
      const { plane, runtime } = connect({
        sandbox,
        createAgent: ({ id }) => ({
          agent: new Agent({
            id,
            instructions: "x",
            tools: [slowTool(gate.promise)],
            model: scriptedModel([
              [toolCall("slow", {}, "c1")],
              (request) => {
                seen.push(JSON.stringify(request.chatHistory));
                return [text("changed course")];
              },
            ]),
          }),
        }),
      });
      await runtime.ready;
      plane.send(runStart);
      await until(() => events(plane).some((event) => event.type === "tool_start"));

      const mentions = [{ type: "skill", name: "deploy", from: 4, to: 11 }];
      expect(
        await steer(plane, "s1", {
          runId: "run-1",
          steerId: "steer-1",
          prompt: "use /deploy",
          mentions,
        }),
      ).toMatchObject({ ok: true, result: { status: "queued" } });
      gate.resolve();
      await until(() => ended(plane).length === 1);

      expect(events(plane).filter((event) => event.type === "steer_applied")).toEqual([
        { type: "steer_applied", id: "steer-1" },
      ]);
      expect(seen[0]).toContain("use /deploy");
      const [filed] = appended(plane);
      expect(filed?.messages.map((message) => message.role)).toEqual([
        "user",
        "assistant",
        "tool",
        "user",
        "assistant",
      ]);
      expect(JSON.stringify(filed?.messages[3])).toContain('"mentions"');
    });

    test("sent while the sandbox is still starting waits for the run to be in the journal", async () => {
      const { sandbox, up } = slowSandbox();
      const seen: string[] = [];
      const { plane, runtime } = connect({
        sandbox,
        createAgent: ({ id }) => ({
          agent: new Agent({
            id,
            instructions: "x",
            model: scriptedModel([
              (request) => {
                seen.push(JSON.stringify(request.chatHistory));
                return [text("ok")];
              },
            ]),
          }),
        }),
      });
      await runtime.ready;
      plane.send(runStart);
      await Bun.sleep(50);

      expect(
        await steer(plane, "s1", { runId: "run-1", steerId: "steer-1", prompt: "also this" }),
      ).toMatchObject({ result: { status: "queued" } });
      up();
      await until(() => ended(plane).length === 1);
      expect(seen[0]).toContain("also this");
      expect(events(plane).some((event) => event.type === "steer_applied")).toBe(true);
    });

    test("is refused for a run that only compacts, and closed for one that has ended", async () => {
      const { sandbox, up } = slowSandbox();
      up();
      const gate = Promise.withResolvers<void>();
      const { plane, runtime } = connect({
        sandbox,
        createAgent: ({ id, compact }) =>
          compact
            ? {
                agent: new Agent({
                  id,
                  instructions: "x",
                  model: scriptedModel([
                    async () => {
                      await gate.promise;
                      return [text("ok")];
                    },
                  ]),
                }),
              }
            : agentThat([text("ok")])({ id } as never),
      });
      await runtime.ready;
      plane.send({ ...runStart, prompt: COMPACT_PROMPT, compact: true });
      await Bun.sleep(50);
      expect(
        await steer(plane, "s1", { runId: "run-1", steerId: "a", prompt: "hello?" }),
      ).toMatchObject({ result: { status: "refused" } });
      gate.resolve();
      await until(() => ended(plane).length === 1);

      expect(
        await steer(plane, "s2", { runId: "run-1", steerId: "b", prompt: "late" }),
      ).toMatchObject({ result: { status: "closed" } });
      expect(
        await steer(plane, "s3", { runId: "unknown", steerId: "c", prompt: "x" }),
      ).toMatchObject({
        result: { status: "closed" },
      });
    });
  });

  test("a run that reaches its turn limit still hands home what it did, with the error", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const lookup = createTool({
      name: "lookup",
      description: "Looks something up",
      inputSchema: z.object({ key: z.string() }),
      execute: ({ key }) => `value of ${key}`,
    });
    const { plane, runtime } = connect({
      sandbox,
      createAgent: ({ id }) => ({
        agent: new Agent({
          id,
          instructions: "x",
          maxTurns: 2,
          tools: [lookup],
          model: scriptedModel([
            [text("one"), toolCall("lookup", { key: "a" }, "call-1")],
            [text("two"), toolCall("lookup", { key: "b" }, "call-2")],
            [text("three"), toolCall("lookup", { key: "c" }, "call-3")],
          ]),
        }),
      }),
    });
    await runtime.ready;
    plane.send(runStart);

    await until(() => ended(plane).length === 1);
    expect(ended(plane)[0]).toMatchObject({ outcome: "error" });
    expect(JSON.stringify(ended(plane)[0])).toContain("Reached max turn limit: 2");
    const [transcript] = appended(plane);
    expect(transcript?.turn).toBe(0);
    expect(transcript?.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
      "tool",
      "assistant",
      "tool",
    ]);
  });

  test("a run that reaches its turn limit after an earlier run files only its own messages", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const lookup = createTool({
      name: "lookup",
      description: "Looks something up",
      inputSchema: z.object({ key: z.string() }),
      execute: ({ key }) => `value of ${key}`,
    });
    const { plane, runtime } = connect({
      sandbox,
      createAgent: ({ id }) => ({
        agent: new Agent({
          id,
          instructions: "x",
          maxTurns: 2,
          tools: [lookup],
          model: scriptedModel(
            id === "run-run-1"
              ? [[text("first reply")]]
              : [
                  [text("one"), toolCall("lookup", { key: "a" }, "call-1")],
                  [text("two"), toolCall("lookup", { key: "b" }, "call-2")],
                  [text("three"), toolCall("lookup", { key: "c" }, "call-3")],
                ],
          ),
        }),
      }),
    });
    await runtime.ready;
    plane.send(runStart);
    await until(() => ended(plane).length === 1);
    plane.send({ ...runStart, runId: "run-2", prompt: "again" });
    await until(() => ended(plane).length === 2);

    const [first, second] = appended(plane);
    expect(first?.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(second?.messages[0]).toMatchObject({ role: "user", content: "again" });
    expect(second?.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
      "tool",
      "assistant",
      "tool",
    ]);
  });

  test("a run that is cancelled still hands home the prompt it was sent", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const working = Promise.withResolvers<void>();
    const hold = Promise.withResolvers<void>();
    const { plane, runtime } = connect({
      sandbox,
      createAgent: ({ id }) => ({
        agent: new Agent({
          id,
          instructions: "x",
          model: scriptedModel([
            async () => {
              working.resolve();
              await hold.promise;
              return [text("never")];
            },
          ]),
        }),
      }),
    });
    await runtime.ready;
    plane.send(runStart);
    await working.promise;

    plane.send({ type: "run.cancel", runId: "run-1", reason: "Cancelled by user" });
    await Bun.sleep(150);
    hold.resolve();
    await until(() => ended(plane).length === 1);
    expect(ended(plane)[0]).toMatchObject({ outcome: "error", error: "Cancelled by user" });
    const [transcript] = appended(plane);
    expect(transcript?.messages).toEqual([
      expect.objectContaining({ role: "user", content: "hi" }),
    ]);
  });

  test("attached files go to /uploads, and an image is shown to the model and kept for the transcript", async () => {
    const sandbox = directoryWorkspaces();
    cleanups.push(() => sandbox.dispose());
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const pdf = new TextEncoder().encode("%PDF-1.7 hello");
    const image = `${crypto.randomUUID()}.png`;
    let asked: CompletionRequest | undefined;
    const { plane, runtime } = connect({
      sandbox,
      createAgent: agentThat((request) => {
        asked = request;
        return [text("seen")];
      }),
    });
    await runtime.ready;
    plane.send({
      ...runStart,
      prompt: "what is in these?",
      attachments: [
        {
          name: "chart.png",
          mediaType: "image/png",
          size: png.length,
          image,
          data: png.toBase64(),
        },
        {
          name: "Q3 report.pdf",
          mediaType: "application/pdf",
          size: pdf.length,
          data: pdf.toBase64(),
        },
      ],
    });

    await until(() => ended(plane).length === 1);
    expect(ended(plane)[0]).toMatchObject({ outcome: "response" });
    const uploads = join(sandbox.uploads.root, thread.id);
    expect(new Uint8Array(await Bun.file(join(uploads, "chart.png")).arrayBuffer())).toEqual(png);
    expect(await Bun.file(join(uploads, "Q3_report.pdf")).text()).toBe("%PDF-1.7 hello");
    expect(await sandbox.artifacts.read(thread.id, image)).toEqual({
      mediaType: "image/png",
      data: png.toBase64(),
    });

    const prompt = asked?.chatHistory.find((message) => message.role === "user");
    const content = Array.isArray(prompt?.content) ? prompt.content : [];
    expect(content[0]).toEqual({ type: "text", text: "what is in these?" });
    const note = content[1]?.type === "text" ? content[1].text : "";
    expect(note).toContain("/uploads/chart.png (image/png, 11 B, shown to you below)");
    expect(note).toContain("/uploads/Q3_report.pdf (application/pdf, 14 B)");
    expect(content[2]).toMatchObject({
      type: "image",
      image: { type: "data", data: png.toBase64() },
    });

    const [transcript] = appended(plane);
    const user = transcript?.messages[0] as { metadata?: unknown } | undefined;
    expect(user?.metadata).toEqual({
      prompt: "what is in these?",
      attachments: [
        { name: "chart.png", mediaType: "image/png", size: 11, image },
        { name: "Q3 report.pdf", mediaType: "application/pdf", size: 14 },
      ],
    });
  });

  test("the files and skills a prompt mentions are pointed out to the model and kept for the transcript", async () => {
    const sandbox = directoryWorkspaces();
    cleanups.push(() => sandbox.dispose());
    const digest = "e".repeat(64);
    const archive = await new Bun.Archive(
      { "SKILL.md": "---\nname: notes\ndescription: Take notes.\n---\nSteps." },
      { compress: "gzip" },
    ).bytes();
    let asked: CompletionRequest | undefined;
    const { plane, runtime } = connect({
      sandbox,
      createAgent: agentThat((request) => {
        asked = request;
        return [text("ok")];
      }),
    });
    await runtime.ready;
    const mentions = [
      { type: "file" as const, name: "src/a.ts", from: 5, to: 14 },
      { type: "skill" as const, name: "notes", from: 20, to: 26 },
    ];
    plane.send({
      ...runStart,
      prompt: "read @src/a.ts with /notes",
      mentions,
      skills: [{ name: "notes", description: "Take notes.", digest }],
    });
    const skillCall = () =>
      plane.received.find((message) => message.type === "call" && message.method === "skills.get");
    await until(() => skillCall() !== undefined);
    const { id } = skillCall() as { id: string };
    plane.send({ type: "reply", id, ok: true, result: { data: archive.toBase64() } });

    await until(() => ended(plane).length === 1);
    const prompt = asked?.chatHistory.find((message) => message.role === "user");
    const content = Array.isArray(prompt?.content) ? prompt.content : [];
    const note = content[1]?.type === "text" ? content[1].text : "";
    expect(note).toContain("- /workspace/src/a.ts");
    expect(note).toContain("- notes: /skills/notes/SKILL.md");
    const [transcript] = appended(plane);
    const user = transcript?.messages[0] as { metadata?: unknown } | undefined;
    expect(user?.metadata).toEqual({ prompt: "read @src/a.ts with /notes", mentions });
  });

  test("a question parks the run, and the answer finishes it with only what is new", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const { plane, runtime } = connect({
      sandbox,
      createAgent: ({ id }) => ({
        agent: new Agent({
          id,
          instructions: "x",
          tools: [createQuestionTool()],
          model: scriptedModel([
            [
              {
                type: "tool-call",
                toolCallId: "q1",
                toolName: "ask_user",
                input: { questions: [{ id: "color", text: "Which color?" }] },
              },
            ],
            [text("Going with red")],
          ]),
        }),
      }),
    });
    await runtime.ready;
    plane.send(runStart);

    await until(() => ended(plane).length === 1);
    const asked = ended(plane)[0];
    expect(asked).toMatchObject({ outcome: "interaction" });
    const continuation = asked && "continuation" in asked ? asked.continuation : undefined;
    expect(continuation).toBeDefined();

    plane.send({
      type: "run.resume",
      runId: "run-2",
      thread,
      continuation,
      response: { type: "tool-question", answers: [{ questionId: "color", value: "red" }] },
    });
    await until(() => ended(plane).length === 2);
    expect(ended(plane)[1]).toMatchObject({ runId: "run-2", outcome: "response" });
    const [first, second] = appended(plane);
    expect(first?.turn).toBe(0);
    expect(second?.turn).toBe(first?.messages.length);
    expect(second?.messages.at(-1)?.role).toBe("assistant");
  });

  test("a goal the agent defines is worked after its turn, and the run ends with the agent's report", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const scripts: Record<string, ScriptStep[]> = {
      "run-run-1": [
        [
          text("Starting a goal. "),
          {
            type: "tool-call",
            toolCallId: "g1",
            toolName: "define_goal",
            input: { objective: "Add paging", acceptanceCriteria: ["it pages"] },
          },
        ],
        [text("Goal started.")],
      ],
      "goal-run-1": [[text("Paging added.")]],
      "run-run-1-report": [[text("All done, paging works.")]],
    };
    const made: { id: string; attended: boolean; tools: string[] }[] = [];
    const { plane, runtime } = connect({
      sandbox,
      createAgent: ({ id, attended, tools }) => {
        made.push({ id, attended, tools: tools.map((tool) => tool.name) });
        return {
          agent: new Agent({
            id,
            instructions: "x",
            tools: [...tools],
            model: scriptedModel(scripts[id] ?? []),
          }),
        };
      },
    });
    await runtime.ready;
    plane.send(runStart);

    await until(() => ended(plane).length === 1);
    expect(ended(plane)[0]).toMatchObject({ outcome: "response" });

    expect(made).toEqual([
      {
        id: "run-run-1",
        attended: true,
        tools: [
          "git_fetch",
          "computer_status",
          "computer_wake",
          "spawn_agent",
          "fork_thread",
          "fork_status",
          "wait_for_forks",
          "take_fork_changes",
          "define_goal",
        ],
      },
      {
        id: "goal-run-1",
        attended: false,
        tools: ["git_fetch", "computer_status", "computer_wake", "spawn_agent"],
      },
      {
        id: "run-run-1-report",
        attended: false,
        tools: ["git_fetch", "computer_status", "computer_wake", "spawn_agent"],
      },
    ]);
    const texts = plane.received.flatMap((m) =>
      m.type === "run.event" && m.event.type === "text" ? [m.event.delta] : [],
    );
    expect(texts).toEqual([
      "Starting a goal. ",
      "Goal started.",
      goalSessionMarker(1),
      "Paging added.",
      "All done, paging works.",
    ]);

    const roles = appended(plane).flatMap((append) =>
      append.messages.map((message) => message.role),
    );
    expect(roles).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
      "assistant",
      "assistant",
      "assistant",
    ]);
  });

  test("a cancel while the goal is working stops it and ends the run", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const working = Promise.withResolvers<void>();
    const hold = Promise.withResolvers<void>();
    const scripts: Record<string, ScriptStep[]> = {
      "run-run-1": [
        [
          {
            type: "tool-call",
            toolCallId: "g1",
            toolName: "define_goal",
            input: { objective: "Add paging", acceptanceCriteria: ["it pages"] },
          },
        ],
        [text("Goal started.")],
      ],
      "goal-run-1": [
        async () => {
          working.resolve();
          await hold.promise;
          return [text("never")];
        },
      ],
    };
    const { plane, runtime } = connect({
      sandbox,
      createAgent: ({ id, tools }) => ({
        agent: new Agent({
          id,
          instructions: "x",
          tools: [...tools],
          model: scriptedModel(scripts[id] ?? []),
        }),
      }),
    });
    await runtime.ready;
    plane.send(runStart);
    await working.promise;

    plane.send({ type: "run.cancel", runId: "run-1", reason: "Cancelled by user" });
    hold.resolve();
    await until(() => ended(plane).length === 1);
    expect(ended(plane)[0]).toMatchObject({ outcome: "error", error: "Cancelled by user" });
  });

  test("a message sent while the goal works is taken by its session at the next step (decision 0210)", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const gate = Promise.withResolvers<void>();
    const working = Promise.withResolvers<void>();
    const seen: string[] = [];
    const slow = createTool({
      name: "slow",
      description: "Takes a while",
      inputSchema: z.object({}),
      execute: async () => {
        working.resolve();
        await gate.promise;
        return "done";
      },
    });
    const scripts: Record<string, ScriptStep[]> = {
      "run-run-1": [
        [
          {
            type: "tool-call",
            toolCallId: "g1",
            toolName: "define_goal",
            input: { objective: "Add paging", acceptanceCriteria: ["it pages"] },
          },
        ],
        [text("Goal started.")],
      ],
      "goal-run-1": [
        [{ type: "tool-call", toolCallId: "s1", toolName: "slow", input: {} }],
        (request) => {
          seen.push(JSON.stringify(request.chatHistory));
          return [text("Paging added.")];
        },
      ],
      "run-run-1-report": [[text("All done.")]],
    };
    const { plane, runtime } = connect({
      sandbox,
      createAgent: ({ id, tools }) => ({
        agent: new Agent({
          id,
          instructions: "x",
          tools: id === "goal-run-1" ? [...tools, slow] : [...tools],
          model: scriptedModel(scripts[id] ?? []),
        }),
      }),
    });
    await runtime.ready;
    plane.send(runStart);
    await working.promise;

    plane.send({
      type: "call",
      id: "steer-1",
      method: "run.steer",
      params: { runId: "run-1", steerId: "steer-a", prompt: "page by cursor" },
    } as never);
    await until(() => plane.received.some((m) => m.type === "reply" && m.id === "steer-1"));
    expect(plane.received.find((m) => m.type === "reply" && m.id === "steer-1")).toMatchObject({
      result: { status: "queued" },
    });
    gate.resolve();

    await until(() => ended(plane).length === 1);
    expect(ended(plane)[0]).toMatchObject({ outcome: "response" });
    expect(seen[0]).toContain("page by cursor");
    expect(plane.received.flatMap((m) => (m.type === "run.event" ? [m.event] : []))).toContainEqual(
      { type: "steer_applied", id: "steer-a" },
    );
  });

  test("an agent hands tasks to subagents that work at the same time, and the control plane hears them", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const started = Promise.withResolvers<void>();
    let working = 0;
    const together = async () => {
      if (++working === 2) started.resolve();
      await started.promise;
      return [text("found it")];
    };
    const scripts: Record<string, ScriptStep[]> = {
      "run-run-1": [
        [
          {
            type: "tool-call",
            toolCallId: "s1",
            toolName: "spawn_agent",
            input: {
              tasks: [
                { description: "Find auth", prompt: "where is auth", type: "explore" },
                { description: "Write a test", prompt: "test it", type: "general" },
              ],
            },
          },
        ],
        [text("Both are done.")],
      ],
      "run-run-1-subagent-explore-0": [together],
      "run-run-1-subagent-general-1": [together],
    };
    const { plane, runtime } = connect({
      sandbox,
      createAgent: ({ id, tools, role }) => ({
        agent: new Agent({
          id,
          instructions: role ? `subagent ${role}` : "x",
          tools: [...tools],
          model: scriptedModel(scripts[id] ?? []),
        }),
      }),
    });
    await runtime.ready;
    plane.send(runStart);

    await until(() => ended(plane).length === 1);
    expect(ended(plane)[0]).toMatchObject({ outcome: "response" });
    const events = plane.received.flatMap((m) => (m.type === "run.event" ? [m.event] : []));
    expect(events.filter((event) => event.type === "subagent")).toEqual([
      { type: "subagent", index: 0, event: { type: "end", status: "done", output: "found it" } },
      { type: "subagent", index: 1, event: { type: "end", status: "done", output: "found it" } },
    ]);
    const spawn = events.find((event) => event.type === "tool_start");
    expect(spawn).toMatchObject({
      tool: { name: "spawn_agent", target: "2 tasks", subagents: [{ index: 0 }, { index: 1 }] },
    });
    expect(events.find((event) => event.type === "tool_end")).toMatchObject({
      id: "s1",
      status: "done",
      output: "2 finished",
    });
  });

  test("a cancel reaches the subagents, which stop what they were doing", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const waiting = Promise.withResolvers<void>();
    let stopped = false;
    const wait = createTool({
      name: "wait",
      description: "Waits.",
      inputSchema: z.object({}),
      execute: async (_input, context) => {
        waiting.resolve();
        await new Promise<void>((resolve) =>
          context?.abortSignal?.addEventListener("abort", () => resolve(), { once: true }),
        );
        stopped = true;
        return "stopped";
      },
    });
    const scripts: Record<string, ScriptStep[]> = {
      "run-run-1": [
        [
          {
            type: "tool-call",
            toolCallId: "s1",
            toolName: "spawn_agent",
            input: { tasks: [{ description: "Wait", prompt: "wait", type: "general" }] },
          },
        ],
        [text("never")],
      ],
      "run-run-1-subagent-general-0": [
        [{ type: "tool-call", toolCallId: "w1", toolName: "wait", input: {} }],
        [text("never")],
      ],
    };
    const { plane, runtime } = connect({
      sandbox,
      createAgent: ({ id, tools, role }) => ({
        agent: new Agent({
          id,
          instructions: "x",
          tools: role ? [...tools, wait] : [...tools],
          model: scriptedModel(scripts[id] ?? []),
        }),
      }),
    });
    await runtime.ready;
    plane.send(runStart);
    await waiting.promise;

    plane.send({ type: "run.cancel", runId: "run-1", reason: "Cancelled by user" });
    await until(() => ended(plane).length === 1);
    expect(ended(plane)[0]).toMatchObject({ outcome: "error", error: "Cancelled by user" });
    await until(() => stopped);
    await Bun.sleep(50);
    const types = plane.received.flatMap((m) => {
      if (m.type === "run.end") return ["end"];
      return m.type === "run.event" ? [m.event.type] : [];
    });
    expect(types.at(-1)).toBe("end");
    expect(types).toContain("subagent");
  });

  test("a goal from a run that failed to file its transcript is not started by the next run", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const made: string[] = [];
    const { plane, runtime } = connect({
      sandbox,
      callTimeoutMs: 100,
      createAgent: ({ id, tools }) => {
        made.push(id);
        const steps: ScriptStep[] =
          id === "run-run-1"
            ? [
                [
                  {
                    type: "tool-call",
                    toolCallId: "g1",
                    toolName: "define_goal",
                    input: { objective: "Add paging", acceptanceCriteria: ["it pages"] },
                  },
                ],
                [text("Goal started.")],
              ]
            : [[text("hello")]];
        return {
          agent: new Agent({
            id,
            instructions: "x",
            tools: [...tools],
            model: scriptedModel(steps),
          }),
        };
      },
    });
    await runtime.ready;
    plane.transcripts.stored = false;
    plane.send(runStart);
    await until(() => ended(plane).length === 1);
    expect(ended(plane)[0]).toMatchObject({ outcome: "error" });

    plane.transcripts.stored = true;
    plane.send({ ...runStart, runId: "run-2" });
    await until(() => ended(plane).length === 2);
    expect(ended(plane)[1]).toMatchObject({ outcome: "response" });
    expect(made).toEqual(["run-run-1", "run-run-2"]);
  });

  describe("when the connection drops", () => {
    test("a run keeps working, and the control plane gets what it missed when it asks", async () => {
      const { sandbox, up } = slowSandbox();
      up();
      const hold = Promise.withResolvers<void>();
      const { plane, runtime } = connect({
        sandbox,
        createAgent: ({ id }) => ({
          agent: new Agent({
            id,
            instructions: "x",
            model: scriptedModel([
              async () => {
                await hold.promise;
                return [text("finished while away")];
              },
            ]),
          }),
        }),
      });
      await runtime.ready;
      plane.send(runStart);
      await Bun.sleep(100);
      const before = plane.received.length;

      plane.drop();
      hold.resolve();
      await until(() => hellos(plane).length === 2);
      expect(hellos(plane)[1]).toMatchObject({ runs: ["run-1"] });
      await Bun.sleep(100);
      expect(plane.received.slice(before).filter((m) => m.type === "run.end")).toEqual([]);

      plane.send({ type: "run.attach", runId: "run-1", after: 0 });
      await until(() => ended(plane).length === 1);
      expect(ended(plane)[0]).toMatchObject({ outcome: "response", seq: 3 });
      const seqs = plane.received.flatMap((m) =>
        m.type === "run.event" || m.type === "run.end" ? [m.seq] : [],
      );
      expect(seqs).toEqual([1, 2, 3]);

      plane.send({ type: "run.ack", runId: "run-1" });
      plane.drop();
      await until(() => hellos(plane).length === 3);
      expect(hellos(plane)[2]).toMatchObject({ runs: [] });
    });
  });

  describe("when the runner restarts", () => {
    test("the run it was working on goes on from where it stopped, without repeating what it did", async () => {
      const { sandbox, up } = slowSandbox();
      up();
      let lookups = 0;
      const lookup = createTool({
        name: "lookup",
        description: "Looks something up",
        inputSchema: z.object({ key: z.string() }),
        execute: ({ key }) => `value of ${++lookups} for ${key}`,
      });
      const hold = Promise.withResolvers<void>();
      const reached = Promise.withResolvers<void>();
      const paths = { journalPath: journalPath() };

      const first = connect({
        sandbox,
        ...paths,
        createAgent: ({ id }) => ({
          agent: new Agent({
            id,
            instructions: "x",
            tools: [lookup],
            model: scriptedModel([
              [text("looking. "), toolCall("lookup", { key: "a" }, "call-1")],
              async () => {
                reached.resolve();
                await hold.promise;
                return [text("never")];
              },
            ]),
          }),
        }),
      });
      await first.runtime.ready;
      first.plane.send(runStart);
      await reached.promise;
      await until(() => first.plane.received.some((m) => m.type === "run.event"));
      const heard = first.plane.received.flatMap((m) => (m.type === "run.event" ? [m.seq] : []));

      const stopping = first.runtime.stop();
      hold.resolve();
      await stopping;

      const second = connect({
        sandbox,
        ...paths,
        createAgent: ({ id }) => ({
          agent: new Agent({
            id,
            instructions: "x",
            tools: [lookup],
            model: scriptedModel([[text("all done")]]),
          }),
        }),
      });
      await second.runtime.ready;
      await until(() => hellos(second.plane).length === 1);
      expect(hellos(second.plane)[0]).toMatchObject({ runs: ["run-1"] });
      second.plane.send({ type: "run.attach", runId: "run-1", after: Math.max(...heard) });

      await until(() => ended(second.plane).length === 1);
      expect(ended(second.plane)[0]).toMatchObject({ outcome: "response" });
      expect(lookups).toBe(1);
      const seqs = second.plane.received.flatMap((m) =>
        m.type === "run.event" || m.type === "run.end" ? [m.seq] : [],
      );
      expect(seqs[0]).toBeGreaterThan(Math.max(...heard));
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
      const texts = second.plane.received.flatMap((m) =>
        m.type === "run.event" && m.event.type === "text" ? [m.event.delta] : [],
      );
      expect(texts).toEqual(["all done"]);

      second.plane.send({ type: "run.ack", runId: "run-1" });
      second.plane.drop();
      await until(() => hellos(second.plane).length === 2);
      expect(hellos(second.plane)[1]).toMatchObject({ runs: [] });
    });

    test("a run the control plane no longer follows is stopped, and said to have ended", async () => {
      const { sandbox, up } = slowSandbox();
      up();
      const hold = Promise.withResolvers<void>();
      const reached = Promise.withResolvers<void>();
      const paths = { journalPath: journalPath() };
      const make: CreateRuntimeAgent = ({ id }) => ({
        agent: new Agent({
          id,
          instructions: "x",
          model: scriptedModel([
            async () => {
              reached.resolve();
              await hold.promise;
              return [text("never")];
            },
          ]),
        }),
      });
      const first = connect({ sandbox, ...paths, createAgent: make });
      await first.runtime.ready;
      first.plane.send(runStart);
      await reached.promise;
      const stopping = first.runtime.stop();
      hold.resolve();
      await stopping;

      const second = connect({ sandbox, ...paths, createAgent: make });
      await until(() => hellos(second.plane).length === 1);
      second.plane.send({ type: "run.cancel", runId: "run-1", reason: "Not followed" });
      await until(() => ended(second.plane).length === 1);
      expect(ended(second.plane)[0]).toMatchObject({ outcome: "error", error: "Not followed" });
    });

    test("a goal goes on from the session it was in, and is checked and reported as usual", async () => {
      const { sandbox: base, up } = slowSandbox();
      up();
      let checks = 0;
      const exec = createTool({
        name: "exec_command",
        description: "run",
        inputSchema: z.object({ command: z.string(), timeoutMs: z.number().optional() }),
        execute: () => ({
          status: "exited",
          exitCode: ++checks === 1 ? 1 : 0,
          stdout: "",
          stderr: checks === 1 ? "1 failed" : "",
        }),
      });
      const sandbox: ThreadWorkspaces = {
        ...base,
        acquire: async () => ({
          tools: [exec],
          hasRunningProcesses: async () => false,
          processes: noProcesses,
        }),
      };
      const hold = Promise.withResolvers<void>();
      const secondSession = Promise.withResolvers<void>();
      const paths = { journalPath: journalPath() };
      const defineGoal: ScriptStep = [
        {
          type: "tool-call",
          toolCallId: "g1",
          toolName: "define_goal",
          input: {
            objective: "Add paging",
            acceptanceCriteria: ["it pages"],
            verifyCommands: ["bun test"],
          },
        },
      ];

      const first = connect({
        sandbox,
        ...paths,
        createAgent: ({ id, tools }) => {
          const steps: ScriptStep[] =
            id === "run-run-1"
              ? [defineGoal, [text("Goal started.")]]
              : [
                  [text("session one done")],
                  async () => {
                    secondSession.resolve();
                    await hold.promise;
                    return [text("never")];
                  },
                ];
          return {
            agent: new Agent({
              id,
              instructions: "x",
              tools: [...tools],
              model: scriptedModel(steps),
            }),
          };
        },
      });
      await first.runtime.ready;
      first.plane.send(runStart);
      await secondSession.promise;
      await until(() =>
        first.plane.received.some(
          (m) =>
            m.type === "run.event" &&
            m.event.type === "text" &&
            m.event.delta === goalSessionMarker(2),
        ),
      );
      const heard = first.plane.received.flatMap((m) => (m.type === "run.event" ? [m.seq] : []));

      const stopping = first.runtime.stop();
      hold.resolve();
      await stopping;

      const second = connect({
        sandbox,
        ...paths,
        createAgent: ({ id, tools }) => ({
          agent: new Agent({
            id,
            instructions: "x",
            tools: [...tools],
            model: scriptedModel(
              id.endsWith("-report")
                ? [[text("All checked, paging works.")]]
                : [[text("session two done")]],
            ),
          }),
        }),
      });
      await until(() => hellos(second.plane).length === 1);
      expect(hellos(second.plane)[0]).toMatchObject({ runs: ["run-1"] });
      second.plane.send({ type: "run.attach", runId: "run-1", after: Math.max(...heard) });

      await until(() => ended(second.plane).length === 1);
      expect(ended(second.plane)[0]).toMatchObject({ outcome: "response" });
      const texts = second.plane.received.flatMap((m) =>
        m.type === "run.event" && m.event.type === "text" ? [m.event.delta] : [],
      );
      expect(texts).toEqual(["session two done", "All checked, paging works."]);
      expect(checks).toBe(2);
      const filed = second.plane.received.flatMap((m) =>
        m.type === "call" && m.method === "memory.append"
          ? [(m.params as { messages: { role: string }[] }).messages.length]
          : [],
      );
      expect(filed).toEqual([2, 1]);
    });

    test("a run this runner has no record of is reported gone", async () => {
      const { sandbox, up } = slowSandbox();
      up();
      const { plane, runtime } = connect({ sandbox });
      await runtime.ready;

      plane.send({ type: "run.attach", runId: "run-gone", after: 0 });

      await until(() => ended(plane).length === 1);
      expect(ended(plane)[0]).toMatchObject({
        outcome: "error",
        error: "The run is gone: this runner has no record of it",
      });
    });
  });
});

describe("startRuntime answering for a bot", () => {
  const botReply = {
    type: "bot.reply",
    replyId: "reply-1",
    bot: {
      id: "bot-1",
      name: "Pip",
      handle: "pip",
      instruction: "",
      description: "",
      canCreateBots: false,
      peers: [],
      timezone: "UTC",
    },
    prompt: "hello",
    model: { provider: "openai", gatewayPath: "/g", gatewayToken: "t" },
  };

  const botThat =
    (...texts: string[]): CreateBotReplyAgent =>
    ({ send, memory }) =>
      new Agent({
        id: "bot",
        model: scriptedModel([
          texts.map((say) => toolCall("send_message", { text: say })),
          [text("")],
        ]),
        instructions: "x",
        memory,
        tools: [createSendMessageTool(send)],
      });

  const writingBot: CreateBotReplyAgent = ({ send, memory }) =>
    new Agent({
      id: "bot",
      model: scriptedModel([
        [toolCall("send_message", { to: "scout", text: "do A" })],
        [toolCall("send_message", { text: "I asked Scout" })],
        [text("")],
      ]),
      instructions: "x",
      memory,
      tools: [createSendMessageTool(send)],
    });

  test("a reply that names a machine runs its tools there, not on this computer", async () => {
    const acquired: string[] = [];
    const sandbox: ThreadWorkspaces = {
      acquire: async (thread) => {
        acquired.push(thread.id);
        return { tools: [], hasRunningProcesses: async () => false, processes: noProcesses };
      },
      workspace: async () => undefined,
      release: async () => undefined,
      dispose: async () => undefined,
    };
    const paths = { workspace: "/m/bot-1", uploads: "/m/up", skills: "/m/sk" };
    const plane = fakeControlPlane({
      answer: (message) => {
        if (message.type !== "call" || message.method !== "machine.call") return undefined;
        const { op } = message.params as { op: string };
        if (op === "paths") return paths;
        if (op === "prepare") return { paths };
        if (op === "skills.install") return { listings: [] };
        if (op === "exec") {
          return {
            status: "exited",
            exitCode: 0,
            stdout: new TextEncoder().encode("/m/bot-1\n").toBase64(),
            stderr: new Uint8Array().toBase64(),
          };
        }
        return null;
      },
    });
    const runtime = startRuntime({
      url: plane.url,
      token: "t",
      journalPath: journalPath(),
      sandbox,
      typingPause: async () => undefined,
      createBotAgent: ({ send, computer, memory }) =>
        new Agent({
          id: "bot",
          model: scriptedModel([
            [toolCall("exec_command", { command: "pwd" })],
            [toolCall("send_message", { text: "ran" })],
            [text("")],
          ]),
          instructions: "x",
          memory,
          tools: [createSendMessageTool(send), ...computer],
        }),
    });
    cleanups.push(() => runtime.stop(), plane.stop);
    await runtime.ready;

    plane.send({ ...botReply, machine: "rt-bot" });
    await until(() => plane.received.some((message) => message.type === "bot.end"));

    expect(acquired).toEqual([]);
    const calls = plane.received.flatMap((message) =>
      message.type === "call" && message.method === "machine.call"
        ? [message.params as { replyId?: string; op: string }]
        : [],
    );
    expect(calls.map((call) => call.op)).toEqual(["paths", "skills.install", "prepare", "exec"]);
    expect(calls.every((call) => call.replyId === "reply-1")).toBe(true);
    expect(plane.received.find((message) => message.type === "bot.say")).toEqual({
      type: "bot.say",
      replyId: "reply-1",
      text: "ran",
    });
  });

  test("a message to another bot is a call to the control plane, and only what the person is sent is shown", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const { plane, runtime } = connect({
      sandbox,
      createBotAgent: writingBot,
      typingPause: async () => undefined,
    });
    await runtime.ready;

    plane.send({
      ...botReply,
      bot: { ...botReply.bot, peers: [{ handle: "scout", name: "Scout", description: "" }] },
    });
    const sent = () =>
      plane.received.find((message) => message.type === "call" && message.method === "bot.send");
    await until(() => sent() !== undefined);
    const call = sent() as Extract<RuntimeToControlPlane, { type: "call" }>;
    expect(call.params).toEqual({ to: "scout", text: "do A", replyId: "reply-1" });
    plane.send({
      type: "reply",
      id: call.id,
      ok: true,
      result: { handle: "scout", name: "Scout" },
    });

    await until(() => plane.received.some((message) => message.type === "bot.end"));
    expect(plane.received.filter((message) => message.type.startsWith("bot."))).toEqual([
      { type: "bot.say", replyId: "reply-1", text: "I asked Scout" },
      { type: "bot.end", replyId: "reply-1" },
    ]);
  });

  test("the bot's messages arrive one by one, then the reply ends, on the bot's own sandbox", async () => {
    const { sandbox, up } = slowSandbox();
    const acquired: string[] = [];
    const counting: ThreadWorkspaces = {
      ...sandbox,
      acquire: async (thread, repo) => (acquired.push(thread.id), sandbox.acquire(thread, repo)),
    };
    up();
    const { plane, runtime } = connect({
      sandbox: counting,
      createBotAgent: botThat("hey!", "how are you?"),
      typingPause: async () => undefined,
    });
    await runtime.ready;

    plane.send(botReply);

    await until(() => plane.received.some((message) => message.type === "bot.end"));
    expect(plane.received.filter((message) => message.type.startsWith("bot."))).toEqual([
      { type: "bot.say", replyId: "reply-1", text: "hey!" },
      { type: "bot.say", replyId: "reply-1", text: "how are you?" },
      { type: "bot.end", replyId: "reply-1" },
    ]);
    expect(acquired).toEqual(["bot-1"]);
    const operations = plane.received.flatMap((message) =>
      message.type === "call" && message.method === "bot.memory"
        ? [(message.params as { op: string }).op]
        : [],
    );
    expect(operations[0]).toBe("load");
    expect(operations.slice(1).length).toBeGreaterThan(0);
    expect(new Set(operations.slice(1))).toEqual(new Set(["append"]));
  });

  test("a cancel from the control plane stops the reply", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const typing = Promise.withResolvers<void>();
    const { plane, runtime } = connect({
      sandbox,
      createBotAgent: botThat("never sent"),
      typingPause: (_ms, signal) =>
        new Promise<void>((_resolve, reject) => {
          typing.resolve();
          signal?.addEventListener("abort", () => reject(signal.reason));
        }),
    });
    await runtime.ready;

    plane.send(botReply);
    await typing.promise;
    plane.send({ type: "bot.cancel", replyId: "reply-1", reason: "Shutting down" });

    await until(() => plane.received.some((message) => message.type === "bot.end"));
    expect(plane.received.find((message) => message.type === "bot.end")).toEqual({
      type: "bot.end",
      replyId: "reply-1",
      error: "Shutting down",
    });
  });

  test("the bot's sandbox is kept while it answers and freed when it has been idle", async () => {
    const { sandbox, up, released } = slowSandbox();
    up();
    const typing = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    const { plane, runtime } = connect({
      sandbox,
      createBotAgent: botThat("a slow thought"),
      idleReleaseMs: 30,
      typingPause: async () => {
        typing.resolve();
        await finish.promise;
      },
    });
    await runtime.ready;

    plane.send(botReply);
    await typing.promise;
    await Bun.sleep(150);
    expect(released).toEqual([]);

    finish.resolve();
    await until(() => released.length === 1);
    expect(released).toEqual(["bot-1"]);
  });
});
