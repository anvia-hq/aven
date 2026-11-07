import { afterAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { db } from "@aven/db/client";
import { organizations } from "@aven/db/schema/organizations";
import { users } from "@aven/db/schema/users";
import { WIRE_VERSION, type ControlPlaneToRuntime } from "@aven/protocol/runtime-wire";
import { eq } from "drizzle-orm";

import { errorsRouter } from "../../errors";
import { createMemoryStore } from "../../memory-store";
import { auth, authService } from "../auth/service";
import { connectRouter } from "../runtimes/connect";
import { RuntimeHub } from "../runtimes/hub";
import { runtimesService } from "../runtimes/service";
import { threadsService } from "../threads/service";
import { processesRouter } from "./router";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("a thread's background processes (real postgres, real WebSocket)", async () => {
  const { seedProject } = await import("../../testing/seed-project");
  const hub = new RuntimeHub(createMemoryStore(db));
  const server = new Elysia()
    .use(errorsRouter)
    .use(connectRouter(hub))
    .use(processesRouter(hub))
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
    answer: (method: string, params: unknown) => { ok: boolean; result?: unknown; error?: string },
  ) {
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
    const calls: { method: string; params: unknown }[] = [];
    await new Promise<void>((resolve, reject) => {
      const init = { headers: { authorization: `Bearer ${token}` } };
      const ws = new WebSocket(`ws://${base}/connect`, init as unknown as string[]);
      sockets.push(ws);
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "hello", version: WIRE_VERSION }));
        resolve();
      };
      ws.onerror = () => reject(new Error("runtime could not connect"));
      ws.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as ControlPlaneToRuntime;
        if (message.type !== "call" || !message.method.startsWith("processes.")) return;
        calls.push({ method: message.method, params: message.params });
        ws.send(
          JSON.stringify({
            type: "reply",
            id: message.id,
            ...answer(message.method, message.params),
          }),
        );
      };
    });
    const deadline = Date.now() + 3000;
    while (!hub.isOnline(runtime.id)) {
      if (Date.now() > deadline) throw new Error("timed out");
      await Bun.sleep(20);
    }
    return { thread, calls };
  }

  const send = (method: "GET" | "POST", path: string, token: string | undefined) =>
    fetch(`http://${base}${path}`, {
      method,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  const get = (path: string, token: string | undefined) => send("GET", path, token);
  const post = (path: string, token: string | undefined) => send("POST", path, token);

  const running = {
    id: "p1",
    command: "npm run dev",
    status: "running",
    startedAt: "2026-11-01T10:00:00.000Z",
  };

  test("lists the thread's processes, reads their output and stops one, through the runner", async () => {
    const { thread, calls } = await setup((method) => {
      if (method === "processes.logs")
        return { ok: true, result: { stdout: "ready\n", stderr: "", truncated: false } };
      const status = method === "processes.stop" ? "stopped" : "running";
      return { ok: true, result: { processes: [{ ...running, status }] } };
    });

    const listed = await get(`/threads/${thread.id}/processes`, owner.token);
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual({ processes: [running] });

    const logs = await get(`/threads/${thread.id}/processes/p1/logs`, owner.token);
    expect(await logs.json()).toEqual({ stdout: "ready\n", stderr: "", truncated: false });

    const stopped = await post(`/threads/${thread.id}/processes/p1/stop`, owner.token);
    expect(await stopped.json()).toEqual({ processes: [{ ...running, status: "stopped" }] });

    expect(calls).toEqual([
      { method: "processes.list", params: { threadId: thread.id } },
      { method: "processes.logs", params: { threadId: thread.id, processId: "p1" } },
      { method: "processes.stop", params: { threadId: thread.id, processId: "p1" } },
    ]);
  });

  test("hides a runtime's own error and an answer it should not give", async () => {
    const failing = await setup(() => ({ ok: false, error: "docker: secret path /home/x" }));
    for (const response of [
      await get(`/threads/${failing.thread.id}/processes`, owner.token),
      await post(`/threads/${failing.thread.id}/processes/p1/stop`, owner.token),
      await get(`/threads/${failing.thread.id}/processes/p1/logs`, owner.token),
    ]) {
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("secret");
    }

    const odd = await setup(() => ({ ok: true, result: { processes: [{ id: 3 }] } }));
    expect((await get(`/threads/${odd.thread.id}/processes`, owner.token)).status).toBe(503);
  });

  test("refuses a stranger and another organization, stopping nothing", async () => {
    const { thread, calls } = await setup(() => ({ ok: true, result: { processes: [] } }));
    const stop = `/threads/${thread.id}/processes/p1/stop`;

    expect((await get(`/threads/${thread.id}/processes`, undefined)).status).toBe(401);
    expect((await post(stop, undefined)).status).toBe(401);
    expect((await get(`/threads/${thread.id}/processes`, outsider.token)).status).toBe(404);
    expect((await post(stop, outsider.token)).status).toBe(404);
    expect((await get(`/threads/${thread.id}/processes/p1/logs`, outsider.token)).status).toBe(404);
    expect(calls).toEqual([]);
  });
});
