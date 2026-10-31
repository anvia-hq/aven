import { afterEach, describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Agent, createQuestionTool, createTool, type CompletionRequest } from "@anvia/core";
import {
  scriptedModel,
  text,
  toolCall,
  type ScriptStep,
} from "@aven/agents/testing/scripted-model";
import { createMessageBotTool } from "@aven/agents/tools/message-bot";
import { createSendMessageTool } from "@aven/agents/tools/send-message";
import { z } from "zod";

import { type RuntimeToControlPlane } from "@aven/protocol/runtime-wire";
import { decodeViewerFrame, encodeViewerFrame } from "@aven/protocol/viewer-frame";

import type { CreateBotReplyAgent } from "./bot-replies";
import type { CreateRuntimeAgent } from "./run-driver";
import { startRuntime } from "./runner";
import type { ThreadSandbox, ThreadWorkspaces } from "./sandbox";
import { directoryWorkspaces } from "./testing/directory-workspaces";
import { fakeDesktop } from "./testing/fake-desktop";
import { goalSessionMarker } from "./goal-report";
import { gitFixture, sh } from "./testing/git-fixture";
import { journalPath } from "./testing/journal-path";

// A control plane that records what the runtime sends and lets the test send frames back.
function fakeControlPlane(options: { storesTranscripts?: boolean } = {}) {
  // Whether the transcript the runner sends home is taken; a test can change it as it goes.
  const transcripts = { stored: options.storesTranscripts !== false };
  const received: RuntimeToControlPlane[] = [];
  const receivedBinary: Uint8Array[] = [];
  let client: { send(data: string | Uint8Array): void; close(): void } | undefined;
  const opened = Promise.withResolvers<void>();
  const server = Bun.serve({
    port: 0,
    fetch: (request, srv) =>
      srv.upgrade(request) ? undefined : new Response("no", { status: 400 }),
    websocket: {
      open(ws) {
        client = ws;
        opened.resolve();
      },
      message(ws, data) {
        if (typeof data !== "string") {
          receivedBinary.push(new Uint8Array(data));
          return;
        }
        const message = JSON.parse(data) as RuntimeToControlPlane;
        received.push(message);
        // The transcript the runner sends home is taken, unless a test says otherwise.
        if (message.type === "call" && message.method === "memory.append" && transcripts.stored)
          ws.send(JSON.stringify({ type: "reply", id: message.id, ok: true, result: null }));
        // A bot's conversation: nothing said before, and whatever is added is taken.
        if (message.type === "call" && message.method === "bot.memory") {
          const result = (message.params as { op: string }).op === "load" ? [] : null;
          ws.send(JSON.stringify({ type: "reply", id: message.id, ok: true, result }));
        }
      },
    },
  });
  return {
    url: `ws://localhost:${server.port}`,
    received,
    receivedBinary,
    transcripts,
    opened: opened.promise,
    send: (message: unknown) => client?.send(JSON.stringify(message)),
    drop: () => client?.close(),
    sendBinary: (frame: Uint8Array) => client?.send(frame),
    stop: () => server.stop(true),
  };
}

const thread = { id: "thread-1", organizationId: "org-1" };
const runStart = { type: "run.start", runId: "run-1", thread, prompt: "hi" };

// Sandboxes that come up when the test says so, and report a running process while `busy.now`.
function slowSandbox() {
  const gate = Promise.withResolvers<void>();
  const released: string[] = [];
  const busy = { now: false };
  const sandbox: ThreadWorkspaces = {
    async acquire(): Promise<ThreadSandbox> {
      await gate.promise;
      return { tools: [], hasRunningProcesses: async () => busy.now };
    },
    desktop: () => undefined,
    workspace: async () => undefined,
    async release(threadId) {
      released.push(threadId);
    },
    async dispose() {},
  };
  return { sandbox, up: gate.resolve, released, busy };
}

// An agent that answers from a script, one step per model call.
const agentThat =
  (...steps: ScriptStep[]): CreateRuntimeAgent =>
  ({ id }) => ({
    agent: new Agent({ id, model: scriptedModel(steps), instructions: "x" }),
  });

const reply = () => agentThat([text("ok")]);

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

describe("startRuntime desktops", () => {
  const viewerId = crypto.randomUUID();
  const withDesktop = (desktop: ReturnType<typeof fakeDesktop>["desktop"] | undefined) => {
    const { sandbox, ...rest } = slowSandbox();
    return { sandbox: { ...sandbox, desktop: () => desktop }, ...rest };
  };

  test("streams a thread's desktop to a viewer and relays the viewer's bytes back", async () => {
    const fake = fakeDesktop();
    const { plane, runtime } = connect({ sandbox: withDesktop(fake.desktop).sandbox });
    await runtime.ready;

    plane.send({ type: "desktop.open", viewerId, threadId: "thread-1" });
    await until(() => plane.received.some((message) => message.type === "desktop.opened"));
    await fake.push(new Uint8Array([82, 70, 66]));
    await until(() => plane.receivedBinary.length === 1);
    expect(decodeViewerFrame(plane.receivedBinary[0]!)).toEqual({
      viewerId,
      payload: new Uint8Array([82, 70, 66]),
    });

    plane.sendBinary(encodeViewerFrame(viewerId, new Uint8Array([9])));
    await until(() => fake.record.written.length === 1);
    expect(fake.record.written[0]).toEqual(new Uint8Array([9]));

    plane.send({ type: "desktop.close", viewerId });
    await until(() => fake.record.closed);
  });

  test("answers a desktop call with its result, or with why it failed", async () => {
    const { plane, runtime } = connect({ sandbox: withDesktop(fakeDesktop().desktop).sandbox });
    await runtime.ready;

    plane.send({ type: "call", id: "c1", method: "desktop.status", params: { threadId: "t1" } });
    plane.send({ type: "call", id: "c2", method: "desktop.takeover", params: { threadId: "t1" } });

    await until(() => plane.received.filter((message) => message.type === "reply").length === 2);
    const replies = plane.received.filter((message) => message.type === "reply");
    expect(replies.find((reply) => reply.id === "c1")).toMatchObject({
      ok: true,
      result: { state: "running", control: { held: false } },
    });
    expect(replies.find((reply) => reply.id === "c2")).toMatchObject({
      ok: false,
      error: "Invalid parameters",
    });
  });

  test("wakes a thread's sandbox without a run, answers with its desktop, and frees it when idle", async () => {
    const fake = fakeDesktop();
    const { sandbox, up, released } = withDesktop(fake.desktop);
    const acquired: string[] = [];
    const counting: ThreadWorkspaces = {
      ...sandbox,
      acquire: async (thread, repo) => (acquired.push(thread.id), sandbox.acquire(thread, repo)),
    };
    const { plane, runtime } = connect({ sandbox: counting, idleReleaseMs: 50 });
    await runtime.ready;
    up();

    plane.send({ type: "call", id: "w1", method: "desktop.wake", params: { threadId: "t1" } });

    await until(() => plane.received.some((message) => message.type === "reply"));
    expect(plane.received.find((message) => message.type === "reply")).toMatchObject({
      ok: true,
      result: { state: "running", control: { held: false } },
    });
    expect(acquired).toEqual(["t1"]);
    // Nothing uses it, so the idle clock frees it again.
    await until(() => released.length === 1);
    expect(released).toEqual(["t1"]);
  });

  test("wakes a bot's computer with no repository, and starts its container", async () => {
    const fake = fakeDesktop();
    const { sandbox, up } = withDesktop(fake.desktop);
    const acquired: { id: string; repo: unknown }[] = [];
    const starts: string[] = [];
    const lazy: ThreadWorkspaces = {
      ...sandbox,
      acquire: async (thread, repo) => {
        acquired.push({ id: thread.id, repo });
        const box = await sandbox.acquire(thread, repo);
        // A bot's container is started by what needs it, here the wake.
        return { ...box, start: async () => void starts.push(thread.id) };
      },
    };
    const { plane, runtime } = connect({ sandbox: lazy });
    await runtime.ready;
    up();

    plane.send({
      type: "call",
      id: "w1",
      method: "desktop.wake",
      params: { threadId: "bot-1", bot: true },
    });

    await until(() => plane.received.some((message) => message.type === "reply"));
    expect(plane.received.find((message) => message.type === "reply")).toMatchObject({
      ok: true,
      result: { state: "running" },
    });
    expect(acquired).toEqual([{ id: "bot-1", repo: undefined }]);
    expect(starts).toEqual(["bot-1"]);
  });

  test("a thread with no workspace is not woken: the clone is made by a run", async () => {
    const { sandbox, up } = withDesktop(undefined);
    // `acquire` asks for the repository only when the workspace holds no clone yet.
    const unclonedSandbox: ThreadWorkspaces = {
      ...sandbox,
      acquire: async (thread, repo) => (await repo?.(), sandbox.acquire(thread, repo)),
    };
    const { plane, runtime } = connect({ sandbox: unclonedSandbox });
    await runtime.ready;
    up();

    plane.send({ type: "call", id: "w2", method: "desktop.wake", params: { threadId: "t1" } });

    await until(() => plane.received.some((message) => message.type === "reply"));
    expect(plane.received.find((message) => message.type === "reply")).toMatchObject({
      ok: false,
      error: "The thread has no workspace yet",
    });
  });

  test("a sandbox someone is watching is not released as idle", async () => {
    const fake = fakeDesktop();
    const { sandbox, up, released } = withDesktop(fake.desktop);
    const { plane, runtime } = connect({
      sandbox,
      idleReleaseMs: 50,
      createAgent: reply(),
    });
    await runtime.ready;
    up();
    plane.send(runStart);
    await until(() => plane.received.some((message) => message.type === "run.end"));
    plane.send({ type: "desktop.open", viewerId, threadId: "thread-1" });
    await until(() => plane.received.some((message) => message.type === "desktop.opened"));

    await Bun.sleep(250);
    expect(released).toEqual([]);

    plane.send({ type: "desktop.close", viewerId });
    await until(() => released.length === 1);
  });
});

describe("startRuntime", () => {
  test("the agent's git_fetch brings a branch into the workspace through the host, with the run's own repo access", async () => {
    const fixture = await gitFixture();
    cleanups.push(fixture.cleanup);
    const sandbox: ThreadWorkspaces = {
      async acquire(): Promise<ThreadSandbox> {
        return { tools: [], hasRunningProcesses: async () => false };
      },
      desktop: () => undefined,
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

    // The tool asks the control plane for this run's access, as the clone does.
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
    // The token reached neither the transcript the control plane keeps nor the workspace's config.
    expect(JSON.stringify(plane.received)).not.toContain("secret-token");
    expect(await Bun.file(`${fixture.root}/.git/config`).text()).not.toContain("secret-token");
  });

  test("the agent's save_environment has the sandbox set the repository up, with the run's own repo access", async () => {
    const access = {
      cloneUrl: "https://github.com/acme/web.git",
      defaultBranch: "main",
      token: "t",
    };
    const saved: { thread: unknown; access: unknown }[] = [];
    const sandbox: ThreadWorkspaces = {
      async acquire(): Promise<ThreadSandbox> {
        return { tools: [], hasRunningProcesses: async () => false };
      },
      desktop: () => undefined,
      workspace: async () => undefined,
      async saveEnvironment(thread, given) {
        saved.push({ thread, access: given });
        return { image: "aven-env-k" };
      },
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
            [{ type: "tool-call", toolCallId: "s1", toolName: "save_environment", input: {} }],
            [text("saved")],
          ]),
        }),
      }),
    });
    await runtime.ready;
    plane.send(runStart);

    await until(() => plane.received.some((message) => message.type === "call"));
    const call = plane.received.find((message) => message.type === "call");
    expect(call).toMatchObject({ method: "repo.access", params: { runId: "run-1" } });
    plane.send({ type: "reply", id: (call as { id: string }).id, ok: true, result: access });

    await until(() => plane.received.some((message) => message.type === "run.end"));
    expect(saved).toEqual([{ thread, access }]);
    expect(plane.received.find((message) => message.type === "run.end")).toMatchObject({
      outcome: "response",
    });
  });

  describe("signing the sandbox in to GitHub for a run (decision 0044)", () => {
    const ada = { token: "ghu_very-secret", id: 42, login: "ada", name: "Ada L" };

    // A sandbox that records who each run signed in as.
    function signingSandbox(options: { failSignIn?: boolean } = {}) {
      const signedIn: { threadId: string; github: unknown }[] = [];
      const identities: { threadId: string; identity: unknown; controlPlane: string }[] = [];
      const sandbox: ThreadWorkspaces = {
        async acquire(): Promise<ThreadSandbox> {
          return { tools: [], hasRunningProcesses: async () => false };
        },
        desktop: () => undefined,
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

    test("a run signs in as the account it came with, and a run with none signs out", async () => {
      const { sandbox, signedIn } = signingSandbox();
      const { plane, runtime } = connect({ sandbox, createAgent: reply() });
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
      const { plane, runtime } = connect({ sandbox, createAgent: reply() });
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

    // A sandbox that records the variables each run was given.
    function envSandbox() {
      const given: { threadId: string; env: unknown }[] = [];
      const sandbox: ThreadWorkspaces = {
        async acquire(): Promise<ThreadSandbox> {
          return { tools: [], hasRunningProcesses: async () => false };
        },
        desktop: () => undefined,
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
      const { plane, runtime } = connect({ sandbox, createAgent: reply() });
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
          acquire: async () => ({ tools: [exec], hasRunningProcesses: async () => false }),
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

  test("a run whose history grows past a megabyte, as screenshots and command output make it, does not end", async () => {
    // What a few desktop screenshots amount to: results of a few hundred kilobytes each.
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
        acquire: async () => ({ tools: [], hasRunningProcesses: async () => false }),
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
    // The sandbox of this test comes up when the test says so.
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
        return { tools: [], hasRunningProcesses: async () => false };
      },
      desktop: () => undefined,
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

    // Several idle periods pass with a dev server still up.
    await Bun.sleep(250);
    expect(released).toEqual([]);

    busy.now = false;
    await until(() => released.includes("thread-1"));
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
      }),
    };
    let runs = 0;
    const { plane, runtime } = connect({
      sandbox: checking,
      idleReleaseMs: 30,
      // The first run ends at once; the second is still going when the idle check comes back.
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
    // The prompt, the assistant's turn, the tool's result and the final reply.
    const [transcript] = appended(plane);
    expect(transcript?.turn).toBe(0);
    expect(transcript?.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
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

    // The model gets the text, where the files are, and the image itself.
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

    // The transcript keeps the message as it was sent, for the client to show.
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
          // One agent for the whole exchange: the run that answers continues the asking run's.
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

    // Every agent of the run can fetch (decision 0042) and hand tasks to subagents (decision 0057);
    // only the one with a person to talk to may define a goal, and only it may ask questions.
    expect(made).toEqual([
      { id: "run-run-1", attended: true, tools: ["git_fetch", "spawn_agent", "define_goal"] },
      { id: "goal-run-1", attended: false, tools: ["git_fetch", "spawn_agent"] },
      { id: "run-run-1-report", attended: false, tools: ["git_fetch", "spawn_agent"] },
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

    // What the user reads: the prompt, the agent's turn, the goal's work and the report. The notes
    // Aven wrote to the agent are not in it.
    const roles = appended(plane).flatMap((append) =>
      append.messages.map((message) => message.role),
    );
    // The session's divider is an assistant message of its own.
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

  test("an agent hands tasks to subagents that work at the same time, and the control plane hears them", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    // Neither subagent finishes before both have started: they run beside each other, not in turn.
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
    // Holds the subagent until it is told to stop; a signal that never came would hang this test.
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
    // What the subagent made of the cancel is told before the run ends, not after.
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
      // The run is under way: the model holds the first reply back.
      await Bun.sleep(100);
      const before = plane.received.length;

      plane.drop();
      hold.resolve();
      // The run finishes with nobody listening; the runner reconnects and says what it holds.
      await until(() => hellos(plane).length === 2);
      expect(hellos(plane)[1]).toMatchObject({ runs: ["run-1"] });
      // Nothing about the run is sent until it is asked for.
      await Bun.sleep(100);
      expect(plane.received.slice(before).filter((m) => m.type === "run.end")).toEqual([]);

      plane.send({ type: "run.attach", runId: "run-1", after: 0 });
      await until(() => ended(plane).length === 1);
      expect(ended(plane)[0]).toMatchObject({ outcome: "response", seq: 3 });
      const seqs = plane.received.flatMap((m) =>
        m.type === "run.event" || m.type === "run.end" ? [m.seq] : [],
      );
      expect(seqs).toEqual([1, 2, 3]);

      // Once the end is acknowledged the run is forgotten.
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

      // The runner stops with the run half done.
      const stopping = first.runtime.stop();
      hold.resolve();
      await stopping;

      // A new runner on the same files. The control plane has the first events and asks for the rest.
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
      // What the first runner did is not done again, and the numbering carries on.
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

      // Acknowledged, it is forgotten for good.
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
      // The goal's check fails after the first session and passes after the second.
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
        acquire: async () => ({ tools: [exec], hasRunningProcesses: async () => false }),
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
      // Everything up to the second session's divider reached the control plane.
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
      // The second session and the report: the first session, and the dividers, were told before.
      expect(texts).toEqual(["session two done", "All checked, paging works."]);
      expect(checks).toBe(2);
      const filed = second.plane.received.flatMap((m) =>
        m.type === "call" && m.method === "memory.append"
          ? [(m.params as { messages: { role: string }[] }).messages.length]
          : [],
      );
      // The second session (its divider and its reply), then the report.
      expect(filed).toEqual([2, 1]);
    });
  });
});

describe("startRuntime answering for a bot", () => {
  const botReply = {
    type: "bot.reply",
    replyId: "reply-1",
    bot: { id: "bot-1", name: "Pip", instruction: "" },
    prompt: "hello",
    model: { provider: "openai", gatewayPath: "/g", gatewayToken: "t" },
  };

  // A bot whose model says one thing, then stops.
  const botThat =
    (...texts: string[]): CreateBotReplyAgent =>
    ({ deliver, memory }) =>
      new Agent({
        id: "bot",
        model: scriptedModel([
          texts.map((say) => toolCall("send_message", { text: say })),
          [text("")],
        ]),
        instructions: "x",
        memory,
        tools: [createSendMessageTool(deliver)],
      });

  // The main bot writes to another bot (decision 0063) and says what it answered.
  const SCOUT = "11111111-2222-4333-8444-555555555555";
  const askingBot: CreateBotReplyAgent = ({ deliver, memory, messageBot }) => {
    const asking = messageBot ? [createMessageBotTool(messageBot)] : [];
    return new Agent({
      id: "bot",
      model: scriptedModel([
        [toolCall("message_bot", { bot: SCOUT, text: "do A" })],
        [toolCall("send_message", { text: "Scout did A" })],
        [text("")],
      ]),
      instructions: "x",
      memory,
      tools: [createSendMessageTool(deliver), ...asking],
    });
  };

  test("a call to another bot waits for its answer past the time any other call is given", async () => {
    const { sandbox, up } = slowSandbox();
    up();
    const { plane, runtime } = connect({
      sandbox,
      createBotAgent: askingBot,
      typingPause: async () => undefined,
      callTimeoutMs: 100,
    });
    await runtime.ready;

    plane.send({
      ...botReply,
      bot: {
        ...botReply.bot,
        canCreateBots: true,
        peers: [{ id: SCOUT, name: "Scout", description: "" }],
      },
    });
    const asked = () =>
      plane.received.find((message) => message.type === "call" && message.method === "bot.ask");
    await until(() => asked() !== undefined);
    // Long enough that an ordinary call would have given up on the control plane.
    await Bun.sleep(300);
    const ask = asked() as Extract<RuntimeToControlPlane, { type: "call" }>;
    expect(ask.params).toEqual({ bot: SCOUT, text: "do A", replyId: "reply-1" });
    plane.send({ type: "reply", id: ask.id, ok: true, result: { replies: ["A is done"] } });

    await until(() => plane.received.some((message) => message.type === "bot.end"));
    expect(plane.received.filter((message) => message.type.startsWith("bot."))).toEqual([
      { type: "bot.say", replyId: "reply-1", text: "Scout did A" },
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
    // Its conversation was read and written through the control plane.
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
    // Well past the idle time, but the bot is still answering.
    expect(released).toEqual([]);

    finish.resolve();
    await until(() => released.length === 1);
    expect(released).toEqual(["bot-1"]);
  });
});
