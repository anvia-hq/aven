import { afterAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { createMemoryStore } from "@aven/agents/memory";
import { db } from "@aven/db/client";
import type { ControlPlaneToRuntime } from "@aven/protocol/runtime-wire";

import { seedOrgPair } from "../../test-support";
import { runtimesRouter } from "./router";
import { connectRouter } from "./connect";
import { RuntimeHub, runtimeHub } from "./hub";
import { runtimesService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("runtime connection (real postgres, real WebSocket)", async () => {
  const seed = await seedOrgPair();
  const store = createMemoryStore(db);
  const hub = new RuntimeHub(store);
  const server = new Elysia().use(connectRouter(hub)).listen({ port: 0 });
  const full = new Elysia().use(runtimesRouter).listen({ port: 0 });
  const sockets: WebSocket[] = [];
  const threadIds: string[] = [];

  afterAll(async () => {
    for (const socket of sockets) socket.close();
    await server.stop(true);
    await full.stop(true);
    for (const id of threadIds) {
      await store.clear({
        scope: { sessionId: id, metadata: { organizationId: seed.orgA } },
      });
    }
    await seed.cleanup();
  });

  const open = (port: number | undefined, token: string, path = "/connect") =>
    new Promise<WebSocket>((resolve, reject) => {
      const init = { headers: { authorization: `Bearer ${token}` } };
      const ws = new WebSocket(`ws://localhost:${port}${path}`, init as unknown as string[]);
      sockets.push(ws);
      ws.onopen = () => resolve(ws);
      ws.onerror = () => reject(new Error("connect failed"));
    });

  const until = async (check: () => boolean, ms = 3000) => {
    const deadline = Date.now() + ms;
    while (!check()) {
      if (Date.now() > deadline) throw new Error("timed out");
      await Bun.sleep(20);
    }
  };

  // Collects what the control plane sends and lets the test answer its calls.
  const inbox = (ws: WebSocket) => {
    const received: ControlPlaneToRuntime[] = [];
    ws.onmessage = (event) => received.push(JSON.parse(String(event.data)));
    return received;
  };

  const ask = (
    ws: WebSocket,
    received: ControlPlaneToRuntime[],
    method: string,
    params: unknown,
  ) => {
    const id = crypto.randomUUID();
    ws.send(JSON.stringify({ type: "call", id, method, params }));
    return until(() => received.some((m) => m.type === "reply" && m.id === id)).then(
      () =>
        received.find((m) => m.type === "reply" && m.id === id) as Extract<
          ControlPlaneToRuntime,
          { type: "reply" }
        >,
    );
  };

  test("a missing, wrong or revoked token never connects", async () => {
    await expect(open(server.server?.port, "")).rejects.toThrow();
    await expect(open(server.server?.port, "avrt_nope")).rejects.toThrow();
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "r" });
    await runtimesService.revoke(seed.orgA, seed.userId, runtime.id);
    await expect(open(server.server?.port, token)).rejects.toThrow();
  });

  test("is mounted at /runtimes/connect and shows online", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "r" });
    await open(full.server?.port, token, "/runtimes/connect");
    await until(() => runtimeHub.isOnline(runtime.id));
  });

  test("a runtime can only touch runs the control plane started on it", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "m" });
    const ws = await open(server.server?.port, token);
    const received = inbox(ws);
    await until(() => hub.isOnline(runtime.id));
    const connection = hub.get(runtime.id)!;

    const thread = { id: crypto.randomUUID(), organizationId: seed.orgA, projectPath: "/tmp" };
    threadIds.push(thread.id);
    const ended: string[] = [];
    connection.startRun("run-1", thread, {
      event: () => undefined,
      end: (outcome) => ended.push(outcome),
      lost: () => undefined,
    });

    // An unknown run id is refused, whatever scope the runtime claims.
    const unknown = await ask(ws, received, "memory.load", { runId: "someone-elses" });
    expect(unknown.ok).toBe(false);

    const message = { role: "user", content: [{ type: "text", text: "hi" }] };
    const appended = await ask(ws, received, "memory.append", {
      runId: "run-1",
      turn: 0,
      messages: [message],
      scope: { sessionId: "other-thread", metadata: { organizationId: "other-org" } },
    });
    expect(appended.ok).toBe(true);
    // It landed in the thread the control plane bound the run to.
    const loaded = await ask(ws, received, "memory.load", { runId: "run-1" });
    expect(JSON.stringify(loaded.result)).toContain("hi");
    expect(
      await store.load({
        scope: { sessionId: "other-thread", metadata: { organizationId: "other-org" } },
      }),
    ).toEqual([]);

    // A notice for a thread this runtime never ran goes nowhere.
    const notices: string[] = [];
    hub.onJobNotice((threadId) => notices.push(threadId));
    ws.send(JSON.stringify({ type: "job.notice", threadId: "stranger", notice: "x" }));
    ws.send(JSON.stringify({ type: "job.notice", threadId: thread.id, notice: "y" }));
    await until(() => notices.length > 0);
    expect(notices).toEqual([thread.id]);

    // Once the run ends, the runtime can no longer write to it.
    ws.send(JSON.stringify({ type: "run.end", runId: "run-1", outcome: "response" }));
    await until(() => ended.length > 0);
    const late = await ask(ws, received, "memory.append", {
      runId: "run-1",
      turn: 1,
      messages: [],
    });
    expect(late.ok).toBe(false);
  });

  test("dropping the connection fails its live runs", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "d" });
    const ws = await open(server.server?.port, token);
    await until(() => hub.isOnline(runtime.id));
    const lost: Error[] = [];
    hub
      .get(runtime.id)!
      .startRun(
        "run-2",
        { id: crypto.randomUUID(), organizationId: seed.orgA, projectPath: "/tmp" },
        { event: () => undefined, end: () => undefined, lost: (error) => lost.push(error) },
      );
    ws.close();
    await until(() => lost.length > 0);
    expect(hub.isOnline(runtime.id)).toBe(false);
  });
});
