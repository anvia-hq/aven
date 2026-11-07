import { afterAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { db } from "@aven/db/client";
import { organizations } from "@aven/db/schema/organizations";
import { users } from "@aven/db/schema/users";
import { WIRE_VERSION, type ControlPlaneToRuntime } from "@aven/protocol/runtime-wire";
import { decodeViewerFrame, encodeViewerFrame } from "@aven/protocol/viewer-frame";
import { eq } from "drizzle-orm";

import { errorsRouter } from "../../errors";
import { createMemoryStore } from "../../memory-store";
import { auth, authService } from "../auth/service";
import { connectRouter } from "../runtimes/connect";
import { RuntimeHub } from "../runtimes/hub";
import { runtimesService } from "../runtimes/service";
import { threadsService } from "../threads/service";
import { desktopRouter } from "./router";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("a thread's desktop (real postgres, real WebSockets)", async () => {
  const { seedProject } = await import("../../testing/seed-project");
  const hub = new RuntimeHub(createMemoryStore(db));
  const server = new Elysia()
    .use(errorsRouter)
    .use(connectRouter(hub))
    .use(desktopRouter(hub))
    .listen({ port: 0 });
  const base = `localhost:${server.server?.port}`;
  const sockets: WebSocket[] = [];
  const emails: string[] = [];
  const organizationIds: string[] = [];

  async function signUp(name: string) {
    const email = `${name}-${crypto.randomUUID().slice(0, 8)}@aven.test`;
    emails.push(email);
    const url = process.env.BETTER_AUTH_URL ?? "http://localhost:5173";
    const post = (path: string, body: object) =>
      auth.handler(
        new Request(`${url}/auth/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    await post("sign-up/email", { name, email, password: "password123" });
    const signIn = await post("sign-in/email", { email, password: "password123" });
    const token = signIn.headers.get("set-auth-token")!;
    const session = await authService.getSession(new Headers({ authorization: `Bearer ${token}` }));
    return {
      token,
      userId: session!.user.id,
      organizationId: session!.session.activeOrganizationId!,
    };
  }

  const owner = await signUp("owner");
  const outsider = await signUp("outsider");
  organizationIds.push(owner.organizationId, outsider.organizationId);

  afterAll(async () => {
    for (const socket of sockets) socket.close();
    await server.stop(true);
    for (const email of emails) await db.delete(users).where(eq(users.email, email));
    for (const id of organizationIds)
      await db.delete(organizations).where(eq(organizations.id, id));
  });

  async function setup(
    behaviour: { running?: boolean; lockedByOther?: boolean; neverRan?: boolean } = {},
  ) {
    const { running = true, lockedByOther = false, neverRan = false } = behaviour;
    const { runtime, token } = await runtimesService.create(owner.organizationId, owner.userId, {
      name: "r",
    });
    const { project } = await seedProject(
      owner.organizationId,
      owner.userId,
      runtime.id,
      `proj-${crypto.randomUUID().slice(0, 8)}`,
    );
    const thread = await threadsService.create(owner.organizationId, owner.userId, {
      projectId: project.id,
    });
    const seen = { messages: [] as ControlPlaneToRuntime[], binary: [] as Uint8Array[] };
    const connect = () =>
      new Promise<WebSocket>((resolve, reject) => {
        const init = { headers: { authorization: `Bearer ${token}` } };
        const ws = new WebSocket(`ws://${base}/connect`, init as unknown as string[]);
        ws.binaryType = "arraybuffer";
        sockets.push(ws);
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: "hello", version: WIRE_VERSION }));
          resolve(ws);
        };
        ws.onerror = () => reject(new Error("runtime could not connect"));
        ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            const frame = decodeViewerFrame(new Uint8Array(event.data));
            if (frame) seen.binary.push(frame.payload);
            return;
          }
          const message = JSON.parse(String(event.data)) as ControlPlaneToRuntime;
          seen.messages.push(message);
          answer(ws, message);
        };
      });
    const answer = (ws: WebSocket, message: ControlPlaneToRuntime) => {
      if (message.type === "desktop.open") {
        const { viewerId } = message;
        if (!running) {
          ws.send(
            JSON.stringify({
              type: "desktop.closed",
              viewerId,
              reason: "The thread's sandbox is not running",
            }),
          );
          return;
        }
        ws.send(JSON.stringify({ type: "desktop.opened", viewerId }));
        ws.send(encodeViewerFrame(viewerId, new TextEncoder().encode("RFB 003.008\n")));
      }
      if (message.type !== "call") return;
      const reply = (ok: boolean, result?: unknown, error?: string) =>
        ws.send(JSON.stringify({ type: "reply", id: message.id, ok, result, error }));
      if (message.method === "desktop.wake") {
        if (neverRan) return reply(false, undefined, "The thread has no workspace yet");
        return reply(true, {
          state: "running",
          width: 1280,
          height: 800,
          control: { held: false },
        });
      }
      if (!running) return reply(true, null);
      if (message.method === "desktop.status") {
        const control = lockedByOther ? { held: true, holder: "someone-else" } : { held: false };
        return reply(true, { state: "running", width: 1280, height: 800, control });
      }
      if (lockedByOther && message.method === "desktop.takeover") {
        return reply(false, undefined, "desktop_locked: held by someone-else");
      }
      reply(true, {
        held: message.method === "desktop.takeover",
        expiresAt: "2030-01-01T00:00:00.000Z",
      });
    };
    const socket = await connect();
    await until(() => hub.isOnline(runtime.id));
    return { thread, seen, socket, runtime };
  }

  const until = async (check: () => boolean, ms = 3000) => {
    const deadline = Date.now() + ms;
    while (!check()) {
      if (Date.now() > deadline) throw new Error("timed out");
      await Bun.sleep(20);
    }
  };

  function view(threadId: string, token: string | undefined, headers: Record<string, string> = {}) {
    const sent = { ...headers };
    if (token) sent.authorization = `Bearer ${token}`;
    const init = { headers: sent, protocols: ["binary"] };
    const ws = new WebSocket(
      `ws://${base}/threads/${threadId}/desktop/stream`,
      init as unknown as string[],
    );
    ws.binaryType = "arraybuffer";
    sockets.push(ws);
    const events = {
      messages: [] as Uint8Array[],
      closed: undefined as CloseEvent | undefined,
      failed: false,
    };
    ws.onmessage = (event) => events.messages.push(new Uint8Array(event.data as ArrayBuffer));
    ws.onclose = (event) => (events.closed = event);
    ws.onerror = () => (events.failed = true);
    return { ws, events };
  }

  const api = (path: string, token: string | undefined, method = "GET") =>
    fetch(`http://${base}${path}`, {
      method,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  test("streams the desktop to the browser, and the browser's bytes go back to the runner", async () => {
    const { thread, seen } = await setup();
    const { ws, events } = view(thread.id, owner.token);

    await until(() => events.messages.length === 1);
    expect(ws.protocol).toBe("binary");
    expect(new TextDecoder().decode(events.messages[0])).toBe("RFB 003.008\n");

    ws.send(new Uint8Array([4, 1, 2]));
    await until(() => seen.binary.length === 1);
    expect(seen.binary[0]).toEqual(new Uint8Array([4, 1, 2]));

    ws.close();
    await until(() => seen.messages.some((message) => message.type === "desktop.close"));
  });

  test("a browser that leaves while the viewer is still opening does not leave it open", async () => {
    const { thread, seen } = await setup();
    const { ws } = view(thread.id, owner.token);

    ws.onopen = () => ws.close();

    await until(() => seen.messages.some((message) => message.type === "desktop.open"));
    await until(() => seen.messages.some((message) => message.type === "desktop.close"));
  });

  test("a thread with no running sandbox ends the stream and says so", async () => {
    const { thread } = await setup({ running: false });
    const { events } = view(thread.id, owner.token);
    await until(() => events.closed !== undefined);
    expect(events.closed?.reason).toBe("The thread's sandbox is not running");
  });

  test("the browser's socket closes when the runner disconnects", async () => {
    const { thread, socket } = await setup();
    const { events } = view(thread.id, owner.token);
    await until(() => events.messages.length === 1);
    socket.close();
    await until(() => events.closed !== undefined);
    expect(events.closed?.reason).toBe("The runtime disconnected");
  });

  test("a viewer must be signed in, in the thread's organization, and from a trusted origin", async () => {
    const { thread } = await setup();

    const anonymous = view(thread.id, undefined);
    const stranger = view(thread.id, outsider.token);
    const foreign = view(thread.id, owner.token, { origin: "http://evil.example" });

    await until(() => anonymous.events.failed && stranger.events.failed && foreign.events.failed);
    for (const { events } of [anonymous, stranger, foreign]) expect(events.messages).toEqual([]);
  });

  test("status says whether the desktop is there and who holds it", async () => {
    const { thread } = await setup();
    const body = await (await api(`/threads/${thread.id}/desktop`, owner.token)).json();
    expect(body).toEqual({
      available: true,
      state: "running",
      width: 1280,
      height: 800,
      held: false,
      heldByMe: false,
    });

    const idle = await setup({ running: false });
    expect(await (await api(`/threads/${idle.thread.id}/desktop`, owner.token)).json()).toEqual({
      available: false,
    });
  });

  test("taking over and releasing go to the runner with the caller as the holder", async () => {
    const { thread, seen } = await setup();

    const taken = await api(`/threads/${thread.id}/desktop/takeover`, owner.token, "POST");
    const freed = await api(`/threads/${thread.id}/desktop/release`, owner.token, "POST");

    expect(await taken.json()).toEqual({ held: true, expiresAt: "2030-01-01T00:00:00.000Z" });
    expect(await freed.json()).toEqual({ held: false });
    const calls = seen.messages.filter((message) => message.type === "call");
    expect(calls.map((call) => call.params)).toEqual([
      { threadId: thread.id, holder: owner.userId, leaseMs: 60_000 },
      { threadId: thread.id, holder: owner.userId },
    ]);
  });

  test("a desktop someone else controls is a conflict, and the runner's words stay in the log", async () => {
    const { thread } = await setup({ lockedByOther: true });
    const status = await (await api(`/threads/${thread.id}/desktop`, owner.token)).json();
    expect(status).toMatchObject({ held: true, heldByMe: false });

    const taken = await api(`/threads/${thread.id}/desktop/takeover`, owner.token, "POST");

    expect(taken.status).toBe(409);
    expect(await taken.text()).toBe("Someone else is controlling the desktop");
  });

  test("taking over with no running sandbox is a conflict", async () => {
    const { thread } = await setup({ running: false });
    const taken = await api(`/threads/${thread.id}/desktop/takeover`, owner.token, "POST");
    expect(taken.status).toBe(409);
  });

  test("waking asks the runner to start the sandbox and answers with the desktop's status", async () => {
    const { thread, seen } = await setup({ running: false });

    const woke = await api(`/threads/${thread.id}/desktop/wake`, owner.token, "POST");

    expect(woke.status).toBe(200);
    expect(await woke.json()).toEqual({
      available: true,
      state: "running",
      width: 1280,
      height: 800,
      held: false,
      heldByMe: false,
    });
    const calls = seen.messages.filter((message) => message.type === "call");
    expect(calls.map((call) => [call.method, call.params])).toEqual([
      ["desktop.wake", { threadId: thread.id }],
    ]);
  });

  test("a thread that never ran cannot be woken, and says why", async () => {
    const { thread } = await setup({ running: false, neverRan: true });
    const woke = await api(`/threads/${thread.id}/desktop/wake`, owner.token, "POST");
    expect(woke.status).toBe(409);
    expect(await woke.text()).toContain("no workspace yet");
  });

  test("the calls need a session and the thread's organization", async () => {
    const { thread } = await setup();
    for (const [path, method] of [
      [`/threads/${thread.id}/desktop`, "GET"],
      [`/threads/${thread.id}/desktop/takeover`, "POST"],
      [`/threads/${thread.id}/desktop/release`, "POST"],
      [`/threads/${thread.id}/desktop/wake`, "POST"],
    ] as const) {
      expect((await api(path, undefined, method)).status).toBe(401);
      expect((await api(path, outsider.token, method)).status).toBe(404);
    }
  });
});
