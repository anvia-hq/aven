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
import { terminalRouter } from "./router";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("a thread's terminal (real postgres, real WebSockets)", async () => {
  const { seedProject } = await import("../../testing/seed-project");
  const hub = new RuntimeHub(createMemoryStore(db));
  const server = new Elysia()
    .use(errorsRouter)
    .use(connectRouter(hub))
    .use(terminalRouter(hub))
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

  const until = async (check: () => boolean, ms = 3000) => {
    const deadline = Date.now() + ms;
    while (!check()) {
      if (Date.now() > deadline) throw new Error("timed out");
      await Bun.sleep(20);
    }
  };

  async function setup() {
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
    const seen = { messages: [] as ControlPlaneToRuntime[] };
    const init = { headers: { authorization: `Bearer ${token}` } };
    const runner = new WebSocket(`ws://${base}/connect`, init as unknown as string[]);
    runner.binaryType = "arraybuffer";
    sockets.push(runner);
    runner.onopen = () => runner.send(JSON.stringify({ type: "hello", version: WIRE_VERSION }));
    runner.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        const frame = decodeViewerFrame(new Uint8Array(event.data));
        if (!frame) return;
        const typed = new TextDecoder().decode(frame.payload).toUpperCase();
        runner.send(encodeViewerFrame(frame.viewerId, new TextEncoder().encode(typed)));
        return;
      }
      const message = JSON.parse(String(event.data)) as ControlPlaneToRuntime;
      seen.messages.push(message);
      if (message.type === "terminal.open") {
        runner.send(JSON.stringify({ type: "terminal.opened", viewerId: message.viewerId }));
      }
    };
    await until(() => hub.isOnline(runtime.id));
    return { thread, seen };
  }

  function view(
    threadId: string,
    token: string | undefined,
    { query = "cols=100&rows=30", headers = {} as Record<string, string> } = {},
  ) {
    const sent = { ...headers };
    if (token) sent.authorization = `Bearer ${token}`;
    const ws = new WebSocket(`ws://${base}/threads/${threadId}/terminal/stream?${query}`, {
      headers: sent,
    } as unknown as string[]);
    ws.binaryType = "arraybuffer";
    sockets.push(ws);
    const events = {
      messages: [] as string[],
      closed: undefined as CloseEvent | undefined,
      failed: false,
    };
    ws.onmessage = (event) =>
      events.messages.push(new TextDecoder().decode(event.data as ArrayBuffer));
    ws.onclose = (event) => (events.closed = event);
    ws.onerror = () => (events.failed = true);
    return { ws, events };
  }

  test("opens a shell of the asked size, carries keystrokes and output, resizes and closes it", async () => {
    const { thread, seen } = await setup();
    const { ws, events } = view(thread.id, owner.token);

    await until(() => seen.messages.some((message) => message.type === "terminal.open"));
    expect(seen.messages.find((message) => message.type === "terminal.open")).toMatchObject({
      threadId: thread.id,
      cols: 100,
      rows: 30,
    });

    ws.send(new TextEncoder().encode("ls\n"));
    await until(() => events.messages.length === 1);
    expect(events.messages[0]).toBe("LS\n");

    ws.send(JSON.stringify({ type: "resize", cols: 80, rows: 24 }));
    await until(() => seen.messages.some((message) => message.type === "terminal.resize"));
    expect(seen.messages.find((message) => message.type === "terminal.resize")).toMatchObject({
      cols: 80,
      rows: 24,
    });

    ws.close();
    await until(() => seen.messages.some((message) => message.type === "terminal.close"));
  });

  test("a size that is not a size is refused", async () => {
    const { thread } = await setup();
    const { events } = view(thread.id, owner.token, { query: "cols=0&rows=30" });
    await until(() => events.failed || events.closed !== undefined);
    const { events: huge } = view(thread.id, owner.token, { query: "cols=99999&rows=30" });
    await until(() => huge.failed || huge.closed !== undefined);
  });

  test("is refused without a login, from another origin, and for another organization's thread", async () => {
    const { thread, seen } = await setup();
    const anonymous = view(thread.id, undefined);
    await until(() => anonymous.events.failed || anonymous.events.closed !== undefined);

    const foreign = view(thread.id, owner.token, { headers: { origin: "https://evil.example" } });
    await until(() => foreign.events.failed || foreign.events.closed !== undefined);

    const stranger = view(thread.id, outsider.token);
    await until(() => stranger.events.failed || stranger.events.closed !== undefined);

    expect(seen.messages.some((message) => message.type === "terminal.open")).toBe(false);
  });

  test("is for the person the thread last ran as, and the creator before any run", async () => {
    const { thread, seen } = await setup();
    await threadsService.markRunBy(thread.id, outsider.userId);

    const creator = view(thread.id, owner.token);
    await until(() => creator.events.failed || creator.events.closed !== undefined);
    expect(seen.messages.some((message) => message.type === "terminal.open")).toBe(false);

    await threadsService.markRunBy(thread.id, owner.userId);
    const again = view(thread.id, owner.token);
    await until(() => seen.messages.some((message) => message.type === "terminal.open"));
    again.ws.close();
  });
});
