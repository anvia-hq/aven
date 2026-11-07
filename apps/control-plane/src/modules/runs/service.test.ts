import { afterAll, describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { scriptedModel, text, toolCall } from "@aven/agents/testing/scripted-model";
import { createCodingAgent } from "@aven/agents/coding-agent";
import { applyEvent } from "@aven/protocol/events";

import { Elysia } from "elysia";
import { startRuntime } from "@aven/runtime-client/runner";
import { directoryWorkspaces } from "@aven/runtime-client/testing/directory-workspaces";
import { journalPath } from "@aven/runtime-client/testing/journal-path";

import { UnavailableError, UnprocessableError } from "../../errors";
import { createMemoryStore } from "../../memory-store";
import { memoryContinuations, memoryFailures } from "../../testing/memory-continuations";
import { seedOrgPair } from "../../testing/seed-org-pair";
import { connectRouter } from "../runtimes/connect";
import { RuntimeHub } from "../runtimes/hub";
import { runtimesService } from "../runtimes/service";
import { RunGateway } from "../runtimes/gateway";
import { RemoteRuntime } from "./remote-runtime";
import { RunBusyError, RunManager } from "./service";
import type { RunEnding, RunThread } from "./types";
import type { ScriptStep } from "@aven/agents/types";
import type { ChatMessage, RunEvent } from "@aven/protocol/types";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("RunManager (remote runtime, scripted model, real postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const store = createMemoryStore(db);
  const threads: RunThread[] = [];
  let finished = 0;

  const scriptedGateway = {
    issue: () => ({
      provider: "anthropic" as const,
      gatewayPath: "/unused",
      gatewayToken: "unused",
    }),
    revoke: () => undefined,
  };
  const continuations = memoryContinuations();
  const failures = memoryFailures();
  const hub = new RuntimeHub(store);
  const seed = await seedOrgPair();
  const server = new Elysia().use(connectRouter(hub)).listen({ port: 0 });
  const clients: { stop(): Promise<void> }[] = [];
  let runtimeId: string | null = null;

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
      journalPath: journalPath(),
      createAgent: ({ id, tools }) =>
        createCodingAgent({ id, tools, webSearch: false, model, retries: false }),
    });
    clients.push(client);
    await client.ready;
    await until(() => hub.isOnline(runtime.id));
    runtimeId = runtime.id;
    return new RunManager({
      store,
      runtime: new RemoteRuntime(hub, scriptedGateway),
      onRunFinished,
      continuations: continuations.store,
      failures: failures.store,
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
      "usage",
      "tool_end",
      "text",
      "usage",
      "done",
    ]);
    expect(client.events[0]).toMatchObject({ type: "snapshot", running: false, messages: [] });
    expect(client.events[0]).not.toHaveProperty("runningMs");

    const history = await manager.history(thread);
    expect(history.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(history[1]!.parts.map((part) => part.type)).toEqual(["text", "tool", "text"]);
    expect(history[1]!.parts[1]).toMatchObject({
      type: "tool",
      tool: { name: "read_file", target: "a.txt", status: "done" },
    });
    await until(() => finished > 0);
  });

  test("a question suspends the run; the answer resumes it in the same message", async () => {
    const asked = {
      id: "color",
      text: "Which color?",
      choices: [
        { label: "Red", value: "red" },
        { label: "Blue", value: "blue" },
      ],
    };
    const manager = await managerWith([
      [
        text("One thing."),
        {
          type: "tool-call",
          toolCallId: "q1",
          toolName: "ask_user",
          input: { questions: [asked] },
        },
      ],
      [text("Going with red.")],
    ]);
    const thread = newThread();
    const client = attach(manager, thread);
    await until(() => client.events.length > 0);

    await manager.start(thread, "paint it");
    await until(() => client.events.some((event) => event.type === "done"));
    expect(client.events.map((event) => event.type)).toEqual([
      "snapshot",
      "run_start",
      "text",
      "tool_start",
      "usage",
      "done",
    ]);
    expect(manager.isRunning(thread.id)).toBe(false);

    const waiting = await manager.history(thread);
    expect(waiting.at(-1)?.parts.at(-1)).toMatchObject({
      type: "tool",
      tool: { name: "ask_user", status: "running", questions: [asked] },
    });
    const continuation = continuations.saved.get(thread.id);
    expect(continuation).toBeDefined();

    await expect(
      manager.answer(thread, continuation, [{ questionId: "nope", value: "red" }]),
    ).rejects.toBeInstanceOf(UnprocessableError);
    expect(continuations.saved.has(thread.id)).toBe(true);

    const before = client.events.length;
    await manager.answer(thread, continuation, [{ questionId: "color", value: "red" }]);
    await until(() => client.events.slice(before).some((event) => event.type === "done"));
    await client.detach();

    expect(client.events.slice(before).map((event) => event.type)).toEqual([
      "run_resume",
      "tool_end",
      "text",
      "usage",
      "done",
    ]);
    expect(continuations.saved.has(thread.id)).toBe(false);

    const history = await manager.history(thread);
    expect(history.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(history[1]!.parts.map((part) => part.type)).toEqual(["text", "tool", "text"]);
    expect(history[1]!.parts[1]).toMatchObject({
      type: "tool",
      tool: { name: "ask_user", status: "done" },
    });
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
    expect(snapshot.runningMs).toBeGreaterThanOrEqual(100);
    expect(snapshot.runningMs).toBeLessThan(3000);
    expect(late.events.slice(1).map((event) => event.type)).toEqual([
      "tool_end",
      "text",
      "usage",
      "done",
    ]);
  });

  test("a run that failed says why to a client that comes later, and after a restart, until the next run", async () => {
    const refusing = () => {
      throw new Error("500 The model is unavailable. Try again later.");
    };
    const kept = memoryFailures();
    const endings: RunEnding[] = [];
    const manager = await managerWith(
      Array.from({ length: 20 }, () => refusing),
      {
        failures: kept.store,
        onRunFinished: (_thread, ending) => void endings.push(ending),
      },
    );
    const thread = newThread();
    await manager.start(thread, "go");
    await until(async () => !manager.isRunning(thread.id), 60_000);
    await until(() => endings.length > 0);
    expect(endings[0]).toMatchObject({ outcome: "failed" });
    expect((endings[0] as { error: string }).error).toContain("The model is unavailable");

    const later = attach(manager, thread);
    await until(() => later.events.length > 0);
    await later.detach();
    expect(later.events[0]).toMatchObject({ type: "snapshot", running: false });
    const said = (later.events[0] as { error?: string }).error;
    expect(said).toContain("The model is unavailable");
    expect(kept.saved.get(thread.id)).toBe(said);

    const restarted = await managerWith([[text("fine now")]], { failures: kept.store });
    const again: RunThread = { ...thread, runtimeId: runtimeId! };
    const fresh = attach(restarted, again);
    await until(() => fresh.events.length > 0);
    expect(fresh.events[0]).toMatchObject({ type: "snapshot", error: said });
    await restarted.start(again, "again");
    await until(() => fresh.events.some((event) => event.type === "done"));
    await fresh.detach();
    expect(kept.saved.has(thread.id)).toBe(false);

    const after = attach(restarted, again);
    await until(() => after.events.length > 0);
    await after.detach();
    expect(after.events[0]).not.toHaveProperty("error");
  }, 90_000);

  test("what comes after a run hears how it ended and which run it was, and activity follows the run (decision 0101)", async () => {
    const endings: { ending: RunEnding; startedAt: number }[] = [];
    const manager = await managerWith(
      [
        [text("Done.")],
        [
          {
            type: "tool-call",
            toolCallId: "q2",
            toolName: "ask_user",
            input: { questions: [{ id: "go", text: "Go on?" }] },
          },
        ],
        [toolCall("exec_command", { command: "sleep 43" })],
      ],
      {
        onRunFinished: (_thread, ending, run) =>
          void endings.push({ ending, startedAt: run.startedAt }),
      },
    );
    const thread = newThread();
    await manager.start(thread, "one");
    const first = manager.activity(thread.id)!;
    expect(first.lastEventAt).toBeGreaterThanOrEqual(first.startedAt);
    await until(() => endings.length === 1);
    expect(manager.activity(thread.id)).toBeUndefined();
    expect(endings[0]).toEqual({ ending: { outcome: "done" }, startedAt: first.startedAt });

    await manager.start(thread, "two");
    await until(() => endings.length === 2);
    expect(endings[1]!.ending).toEqual({ outcome: "question" });

    const other = newThread();
    await manager.start(other, "three");
    const early = manager.activity(other.id)!;
    await until(() => manager.activity(other.id)!.lastEventAt > early.lastEventAt);
    await until(() => alive("sleep 43"));
    manager.cancel(other.id);
    await until(() => endings.length === 3);
    expect(endings[2]).toEqual({ ending: { outcome: "cancelled" }, startedAt: early.startedAt });
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
    await expect(manager.start(offline, "hi")).rejects.toBeInstanceOf(UnavailableError);
    expect(await manager.history(offline)).toEqual([]);
  });

  describe("a message sent while the agent works", () => {
    const message = (id: string, prompt = "use the other one") => ({ id, prompt, mentions: [] });

    test("is queued, taken at the next step and kept in the transcript where it was taken", async () => {
      const manager = await managerWith([
        [toolCall("exec_command", { command: "sleep 0.6; echo slow" }, "c1")],
        [text("Switched.")],
      ]);
      const thread = newThread();
      const client = attach(manager, thread);
      await until(() => client.events.length > 0);
      await manager.start(thread, "build it");
      await until(() => client.events.some((event) => event.type === "tool_start"));

      expect(await manager.steer(thread, message("steer-1"))).toBe("queued");
      const late = attach(manager, thread);
      await until(() => late.events.length > 0);
      await late.detach();
      expect(late.events[0]).toMatchObject({
        type: "snapshot",
        steers: [{ id: "steer-1", prompt: "use the other one" }],
      });

      await until(() => client.events.some((event) => event.type === "done"));
      await client.detach();
      const types = client.events.map((event) => event.type);
      expect(types.filter((type) => type.startsWith("steer"))).toEqual(["steer_queued", "steer"]);
      expect(types).not.toContain("steer_applied");
      expect(client.events.find((event) => event.type === "steer")).toMatchObject({
        id: "steer-1",
        prompt: "use the other one",
      });

      const live = client.events.reduce(
        (messages, event) => applyEvent(messages, event),
        [] as ChatMessage[],
      );
      const history = await manager.history(thread);
      expect(history.map((entry) => entry.role)).toEqual([
        "user",
        "assistant",
        "user",
        "assistant",
      ]);
      expect(history).toEqual(live);
      await until(() => finished > 0);
    });

    test("is refused, and shown as such, for a run that only compacts", async () => {
      const manager = await managerWith([[text("Nothing to summarize.")]]);
      const thread = newThread();
      const client = attach(manager, thread);
      await until(() => client.events.length > 0);
      await manager.start(thread, "/compact", undefined, { compact: true });
      await expect(manager.steer(thread, message("steer-2"))).rejects.toThrow("compacted");
      await until(() => client.events.some((event) => event.type === "done"));
      await client.detach();
      const types = client.events.map((event) => event.type);
      expect(types.filter((type) => type.startsWith("steer"))).toEqual([
        "steer_queued",
        "steer_rejected",
      ]);
    });

    test("that the agent never took is said not to be delivered when the run is stopped", async () => {
      const manager = await managerWith([
        [toolCall("exec_command", { command: "sleep 41" }, "c1")],
      ]);
      const thread = newThread();
      const client = attach(manager, thread);
      await until(() => client.events.length > 0);
      await manager.start(thread, "wait");
      await until(() => client.events.some((event) => event.type === "tool_start"));
      expect(await manager.steer(thread, message("steer-3"))).toBe("queued");

      manager.cancel(thread.id);
      await until(() => client.events.some((event) => event.type === "done"));
      await client.detach();
      expect(client.events.find((event) => event.type === "steer_rejected")).toMatchObject({
        id: "steer-3",
        reason: expect.stringContaining("ended"),
      });
      expect(manager.isRunning(thread.id)).toBe(false);
      await Bun.$`pkill -f ${"sleep 41"}`.nothrow().quiet();
    });

    test("has nowhere to go when the thread has no run", async () => {
      const manager = await managerWith([]);
      expect(await manager.steer(newThread(), message("steer-4"))).toBe("ended");
    });
  });
});
