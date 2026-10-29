import { afterAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { createMemoryStore } from "@aven/agents/memory";
import { db } from "@aven/db/client";
import { WIRE_VERSION, type ControlPlaneToRuntime } from "@aven/protocol/runtime-wire";

import { seedOrgPair } from "../../testing/seed-org-pair";
import { runtimesRouter } from "./router";
import { connectRouter } from "./connect";
import { RuntimeHub, runtimeHub } from "./hub";
import { runtimesService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("runtime connection (real postgres, real WebSocket)", async () => {
  const seed = await seedOrgPair();
  const store = createMemoryStore(db);
  const cloned: string[] = [];
  const repoAccess = {
    cloneUrl: "https://github.com/acme/web.git",
    defaultBranch: "main",
    token: "t",
  };
  const hub = new RuntimeHub(store, async (threadId) => {
    cloned.push(threadId);
    return repoAccess;
  });
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

  // Connects and, like a real runtime, says hello the moment the socket opens.
  const open = (
    port: number | undefined,
    token: string,
    path = "/connect",
    version: number | null = WIRE_VERSION,
  ) =>
    new Promise<WebSocket>((resolve, reject) => {
      const init = { headers: { authorization: `Bearer ${token}` } };
      const ws = new WebSocket(`ws://localhost:${port}${path}`, init as unknown as string[]);
      sockets.push(ws);
      ws.onopen = () => {
        if (version !== null) ws.send(JSON.stringify({ type: "hello", version }));
        resolve(ws);
      };
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

  test("repository access is only given for a live run, and for that run's own thread", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "g" });
    const ws = await open(server.server?.port, token);
    const received = inbox(ws);
    await until(() => hub.isOnline(runtime.id));
    const connection = hub.get(runtime.id)!;
    const thread = { id: crypto.randomUUID(), organizationId: seed.orgA };
    connection.startRun("run-git", thread, {
      event: () => undefined,
      end: () => undefined,
      lost: () => undefined,
    });

    const unknown = await ask(ws, received, "repo.access", { runId: "someone-elses" });
    expect(unknown.ok).toBe(false);
    expect(cloned).toEqual([]);

    // A thread named by the runtime is ignored; the run's own thread is what counts.
    const given = await ask(ws, received, "repo.access", { runId: "run-git", threadId: "other" });
    expect(given).toMatchObject({ ok: true, result: repoAccess });
    expect(cloned).toEqual([thread.id]);

    connection.endRun("run-git");
    expect((await ask(ws, received, "repo.access", { runId: "run-git" })).ok).toBe(false);
  });

  test("a runtime can only touch runs the control plane started on it", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "m" });
    const ws = await open(server.server?.port, token);
    const received = inbox(ws);
    await until(() => hub.isOnline(runtime.id));
    const connection = hub.get(runtime.id)!;

    const thread = { id: crypto.randomUUID(), organizationId: seed.orgA };
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

  test("a malformed frame is dropped and malformed call parameters are answered, not thrown", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, {
      name: "bad",
    });
    const ws = await open(server.server?.port, token);
    const received = inbox(ws);
    await until(() => hub.isOnline(runtime.id));
    const ended: string[] = [];
    hub
      .get(runtime.id)!
      .startRun(
        "run-bad",
        { id: crypto.randomUUID(), organizationId: seed.orgA },
        { event: () => undefined, end: (outcome) => ended.push(outcome), lost: () => undefined },
      );

    for (const frame of [
      "not json",
      "null",
      "{}",
      '{"type":"run.end"}',
      '{"type":"run.end","runId":7}',
    ]) {
      ws.send(frame);
    }
    const noParams = await ask(ws, received, "memory.load", undefined);
    expect(noParams.ok).toBe(false);
    const badAppend = await ask(ws, received, "memory.append", { runId: "run-bad", turn: "0" });
    expect(badAppend.ok).toBe(false);
    expect(badAppend.error).toContain("Invalid parameters");

    // The connection survived all of it, and the run is still live.
    expect(hub.isOnline(runtime.id)).toBe(true);
    expect(ended).toEqual([]);
    ws.send(JSON.stringify({ type: "run.end", runId: "run-bad", outcome: "response" }));
    await until(() => ended.length > 0);
  });

  test("a socket upgraded while its runtime was being revoked is cut off once attached", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, {
      name: "race",
    });
    const checked = await runtimesService.authenticate(token);
    // The revoke lands after the token was checked and before the socket attached.
    await runtimesService.revoke(seed.orgA, seed.userId, runtime.id);
    const authenticate = runtimesService.authenticate;
    runtimesService.authenticate = async () => checked;
    try {
      const ws = await open(server.server?.port, token);
      const closed = new Promise<number>((resolve) => {
        ws.onclose = (event) => resolve(event.code);
      });
      expect(await closed).toBe(4002);
      expect(hub.isOnline(runtime.id)).toBe(false);
    } finally {
      runtimesService.authenticate = authenticate;
    }
  });

  test("a runtime can send only the events its agent projects, and only a known outcome", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "ev" });
    const ws = await open(server.server?.port, token);
    await until(() => hub.isOnline(runtime.id));
    const events: unknown[] = [];
    const ended: string[] = [];
    hub
      .get(runtime.id)!
      .startRun(
        "run-ev",
        { id: crypto.randomUUID(), organizationId: seed.orgA },
        { event: (e) => events.push(e), end: (o) => ended.push(o), lost: () => undefined },
      );

    const forged = { type: "snapshot", messages: [], running: false };
    ws.send(JSON.stringify({ type: "run.event", runId: "run-ev", event: forged }));
    ws.send(JSON.stringify({ type: "run.event", runId: "run-ev", event: { type: "done" } }));
    ws.send(JSON.stringify({ type: "run.end", runId: "run-ev", outcome: "totally-fine" }));
    ws.send(
      JSON.stringify({ type: "run.event", runId: "run-ev", event: { type: "text", delta: "ok" } }),
    );
    await until(() => events.length > 0);
    expect(events).toEqual([{ type: "text", delta: "ok" }]);
    expect(ended).toEqual([]);
  });

  test("a runtime is not online until it says hello with a version we speak", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "h" });
    const silent = await open(server.server?.port, token, "/connect", null);
    await Bun.sleep(150);
    expect(hub.isOnline(runtime.id)).toBe(false);
    silent.send(JSON.stringify({ type: "hello", version: WIRE_VERSION }));
    await until(() => hub.isOnline(runtime.id));

    const other = await runtimesService.create(seed.orgA, seed.userId, { name: "old" });
    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      open(server.server?.port, other.token, "/connect", WIRE_VERSION + 1).then((ws) => {
        ws.onclose = (event) => resolve({ code: event.code, reason: event.reason });
      });
    });
    const { code, reason } = await closed;
    expect(code).toBe(4000);
    expect(reason).toContain("Unsupported runtime version");
    expect(hub.isOnline(other.runtime.id)).toBe(false);
  });

  // These go through the service, which acts on the real hub, so they use the full app.
  test("revoking cuts a connected runtime off and fails its live runs", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "x" });
    const ws = await open(full.server?.port, token, "/runtimes/connect");
    await until(() => runtimeHub.isOnline(runtime.id));
    const lost: Error[] = [];
    runtimeHub
      .get(runtime.id)!
      .startRun(
        "run-revoke",
        { id: crypto.randomUUID(), organizationId: seed.orgA },
        { event: () => undefined, end: () => undefined, lost: (error) => lost.push(error) },
      );
    const closed = new Promise<number>((resolve) => {
      ws.onclose = (event) => resolve(event.code);
    });
    await runtimesService.revoke(seed.orgA, seed.userId, runtime.id);
    expect(await closed).toBe(4002);
    expect(lost).toHaveLength(1);
    expect(runtimeHub.isOnline(runtime.id)).toBe(false);
  });

  test("rotating the token cuts the runtime off and only the new token connects", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, { name: "r" });
    const ws = await open(full.server?.port, token, "/runtimes/connect");
    await until(() => runtimeHub.isOnline(runtime.id));
    const closed = new Promise<number>((resolve) => {
      ws.onclose = (event) => resolve(event.code);
    });

    expect(await runtimesService.rotate(seed.orgA, "someone-else", runtime.id)).toBeNull();
    const rotated = await runtimesService.rotate(seed.orgA, seed.userId, runtime.id);
    expect(rotated?.token).not.toBe(token);
    expect(rotated?.runtime.tokenHint).toBe(rotated?.token.slice(-4));
    expect(await closed).toBe(4002);

    await expect(open(full.server?.port, token, "/runtimes/connect")).rejects.toThrow();
    await open(full.server?.port, rotated!.token, "/runtimes/connect");
    await until(() => runtimeHub.isOnline(runtime.id));
    expect(JSON.stringify(await runtimesService.list(seed.orgA))).not.toContain(rotated!.token);
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
        { id: crypto.randomUUID(), organizationId: seed.orgA },
        { event: () => undefined, end: () => undefined, lost: (error) => lost.push(error) },
      );
    ws.close();
    await until(() => lost.length > 0);
    expect(hub.isOnline(runtime.id)).toBe(false);
  });
});
