import { afterAll, describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  scriptedModel,
  text,
  toolCall,
  type ScriptStep,
} from "@aven/agents/testing/scripted-model";
import { createCodingAgent } from "@aven/agents/coding-agent";
import { createMemoryStore } from "@aven/agents/memory";
import type { RunEvent } from "@aven/protocol/events";

import { Elysia } from "elysia";
import { startRuntime } from "@aven/runtime-client/runner";
import { directoryWorkspaces } from "@aven/runtime-client/testing/directory-workspaces";

import { UnavailableError } from "../../errors";
import { seedOrgPair } from "../../testing/seed-org-pair";
import { connectRouter } from "../runtimes/connect";
import { RuntimeHub } from "../runtimes/hub";
import { runtimesService } from "../runtimes/service";
import { RunGateway } from "../runtimes/gateway";
import { RemoteRuntime } from "./remote-runtime";
import type { RunThread } from "./runtime";
import { RunBusyError, RunManager } from "./service";

// Needs the migrated Postgres from DATABASE_URL; skipped when there is none.
const run = process.env.DATABASE_URL ? describe : describe.skip;

// Runs happen on a runner connected over a real WebSocket (decisions 0008 and 0010); its workspaces
// here are plain temporary directories, since a scripted model needs no container.
run("RunManager (remote runtime, scripted model, real postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const store = createMemoryStore(db);
  const threads: RunThread[] = [];
  let finished = 0;

  // The scripted model never calls a provider, so there is nothing for the gateway to guard here.
  const scriptedGateway = {
    issue: () => ({
      provider: "anthropic" as const,
      gatewayPath: "/unused",
      gatewayToken: "unused",
    }),
    revoke: () => undefined,
  };
  const hub = new RuntimeHub(store);
  const seed = await seedOrgPair();
  const server = new Elysia().use(connectRouter(hub)).listen({ port: 0 });
  const clients: { stop(): Promise<void> }[] = [];
  let runtimeId: string | null = null;

  // One scripted model per manager, shared by every run on it, so a script spans multiple runs.
  const managerWith = async (
    steps: ScriptStep[],
    extra: Partial<ConstructorParameters<typeof RunManager>[0]> = {},
  ) => {
    const model = scriptedModel(steps);
    const onRunFinished = () => {
      finished++;
    };
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, {
      name: "loopback",
    });
    const workspaces = directoryWorkspaces((root) => writeFile(join(root, "a.txt"), "hello\n"));
    const client = startRuntime({
      url: `ws://localhost:${server.server!.port}/connect`,
      token,
      sandbox: workspaces,
      createAgent: ({ tools, memory }) =>
        createCodingAgent({ tools, memory, webSearch: false, model }),
    });
    clients.push(client);
    await client.ready;
    await until(() => hub.isOnline(runtime.id));
    runtimeId = runtime.id;
    return new RunManager({
      store,
      runtime: new RemoteRuntime(hub, scriptedGateway),
      onRunFinished,
      ...extra,
    });
  };

  const newThread = (): RunThread => {
    const thread = {
      id: crypto.randomUUID(),
      organizationId: "org-test",
      runtimeId: runtimeId!,
    };
    threads.push(thread);
    return thread;
  };

  // Attaches like an SSE client would and records what it sees.
  const attach = (manager: RunManager, thread: RunThread) => {
    const controller = new AbortController();
    const events: RunEvent[] = [];
    const loop = (async () => {
      for await (const event of manager.events(thread, controller.signal)) {
        if (event) events.push(event);
      }
    })();
    return {
      events,
      detach: async () => {
        controller.abort();
        await loop;
      },
    };
  };

  const until = async (check: () => boolean | Promise<boolean>, ms = 5000) => {
    const deadline = Date.now() + ms;
    while (!(await check())) {
      if (Date.now() > deadline) throw new Error("timed out waiting for condition");
      await Bun.sleep(25);
    }
  };

  const alive = async (pattern: string) =>
    (await Bun.$`pgrep -f ${pattern}`.nothrow().quiet()).exitCode === 0;

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.stop()));
    hub.closeAll();
    await server.stop(true);
    await seed.cleanup();
    for (const thread of threads) {
      await store.clear({
        scope: { sessionId: thread.id, metadata: { organizationId: thread.organizationId } },
      });
    }
  });

  test("streams a snapshot, then ordered run events, and reloads as history", async () => {
    const manager = await managerWith([
      [text("Looking."), toolCall("read_file", { path: "a.txt" }, "c1")],
      [text("It says hello.")],
    ]);
    const thread = newThread();
    const client = attach(manager, thread);
    await until(() => client.events.length > 0);

    await manager.start(thread, "what is in a.txt?");
    await until(() => client.events.some((event) => event.type === "done"));
    await client.detach();

    expect(client.events.map((event) => event.type)).toEqual([
      "snapshot",
      "run_start",
      "text",
      "tool_start",
      "tool_end",
      "text",
      "done",
    ]);
    expect(client.events[0]).toMatchObject({ type: "snapshot", running: false, messages: [] });

    const history = await manager.history(thread);
    expect(history.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(history[1]!.parts.map((part) => part.type)).toEqual(["text", "tool", "text"]);
    expect(history[1]!.parts[1]).toMatchObject({
      type: "tool",
      tool: { name: "read_file", target: "a.txt", status: "done" },
    });
    await until(() => finished > 0);
  });

  test("a client that joins mid-run gets the transcript so far, then the rest", async () => {
    const manager = await managerWith([
      [toolCall("exec_command", { command: "sleep 0.6; echo slow" }, "c1")],
      [text("finished")],
    ]);
    const thread = newThread();
    await manager.start(thread, "go");
    await Bun.sleep(150);

    const late = attach(manager, thread);
    await until(() => late.events.some((event) => event.type === "done"));
    await late.detach();

    const snapshot = late.events[0]!;
    expect(snapshot).toMatchObject({ type: "snapshot", running: true });
    if (snapshot.type !== "snapshot") throw new Error("expected a snapshot");
    expect(snapshot.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(late.events.slice(1).map((event) => event.type)).toEqual(["tool_end", "text", "done"]);
  });

  test("dropping every client does not cancel the run", async () => {
    const manager = await managerWith([
      [toolCall("exec_command", { command: "sleep 0.5; echo survived" }, "c1")],
      [text("still here")],
    ]);
    const thread = newThread();
    const client = attach(manager, thread);
    await until(() => client.events.length > 0);
    await manager.start(thread, "go");
    await until(() => client.events.some((event) => event.type === "run_start"));
    await client.detach();

    await until(async () => !manager.isRunning(thread.id));
    const history = await manager.history(thread);
    expect(JSON.stringify(history)).toContain("still here");
    expect(JSON.stringify(history)).toContain("survived");
  });

  test("a second start while running is rejected", async () => {
    const manager = await managerWith([
      [toolCall("exec_command", { command: "sleep 0.4" })],
      [text("ok")],
    ]);
    const thread = newThread();
    await manager.start(thread, "one");
    await expect(manager.start(thread, "two")).rejects.toBeInstanceOf(RunBusyError);
    await until(async () => !manager.isRunning(thread.id));
  });

  test("cancel stops the run and the command it is waiting on", async () => {
    const manager = await managerWith([
      [toolCall("exec_command", { command: "sleep 41" })],
      [text("never")],
    ]);
    const thread = newThread();
    const client = attach(manager, thread);
    await until(() => client.events.length > 0);
    await manager.start(thread, "go");
    await until(() => alive("sleep 41"));

    expect(manager.cancel(thread.id)).toBe(true);
    await until(() => client.events.some((event) => event.type === "done"));
    await client.detach();
    await until(async () => !(await alive("sleep 41")));
    expect(manager.isRunning(thread.id)).toBe(false);
  });

  test("cancel leaves a process the agent started running in its sandbox", async () => {
    const manager = await managerWith([
      [toolCall("start_process", { command: "sleep 43" }, "c1")],
      [toolCall("exec_command", { command: "sleep 3" }, "c2")],
      [text("never reached")],
    ]);
    const thread = newThread();
    const client = attach(manager, thread);
    await until(() => client.events.length > 0);
    await manager.start(thread, "go");
    await until(() => alive("sleep 3"));

    manager.cancel(thread.id);
    await until(() => client.events.some((event) => event.type === "done"));
    await client.detach();

    // The foreground command was part of the run and is gone; the server-like process is not.
    await until(async () => !(await alive("sleep 3")));
    expect(await alive("sleep 43")).toBe(true);
    expect(JSON.stringify(await manager.history(thread))).not.toContain("never reached");
    await Bun.$`pkill -f ${"sleep 43"}`.nothrow().quiet();
  });

  test("a setup failure (no API key) surfaces from start and persists nothing", async () => {
    const saved = { ...process.env };
    delete process.env.AGENT_PROVIDER;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      // The real gateway, which is what refuses a model it has no key for.
      const manager = await managerWith([], { runtime: new RemoteRuntime(hub, new RunGateway()) });
      const thread = newThread();
      await expect(manager.start(thread, "hi")).rejects.toThrow("ANTHROPIC_API_KEY is not set");
      await expect(manager.start(thread, "hi")).rejects.toBeInstanceOf(UnavailableError);
      expect(manager.isRunning(thread.id)).toBe(false);
      expect(await manager.history(thread)).toEqual([]);
    } finally {
      Object.assign(process.env, saved);
    }
  });

  test("a thread whose runner is offline says so and persists nothing", async () => {
    const manager = await managerWith([]);
    const offline = { ...newThread(), runtimeId: crypto.randomUUID() };
    await expect(manager.start(offline, "hi")).rejects.toThrow("offline");
    // This is what the API answers with 503; any other error is not.
    await expect(manager.start(offline, "hi")).rejects.toBeInstanceOf(UnavailableError);
    expect(await manager.history(offline)).toEqual([]);
  });
});
