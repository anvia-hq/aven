import { afterAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { db } from "@aven/db/client";
import { organizations } from "@aven/db/schema/organizations";
import { users } from "@aven/db/schema/users";
import { WIRE_VERSION } from "@aven/protocol/runtime-wire";
import { eq } from "drizzle-orm";

import { errorsRouter } from "@aven/server-kit/errors";
import { createMemoryStore } from "../../memory-store";
import { auth, authService } from "../auth/service";
import { connectRouter } from "../runtimes/connect";
import { RuntimeHub } from "../runtimes/hub";
import { runtimesService } from "../runtimes/service";
import { threadsService } from "../threads/service";
import { diffRouter } from "./router";
import type { ControlPlaneToRuntime } from "@aven/protocol/types";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("a thread's changes (real postgres, real WebSocket)", async () => {
  const { seedProject } = await import("../../testing/seed-project");
  const hub = new RuntimeHub(createMemoryStore(db));
  const server = new Elysia()
    .use(errorsRouter)
    .use(connectRouter(hub))
    .use(diffRouter(hub))
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
    answer: (params: unknown) => { ok: boolean; result?: unknown; error?: string },
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
    const calls: unknown[] = [];
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

        if (message.type !== "call" || message.method !== "diff.get") return;

        calls.push(message.params);
        ws.send(JSON.stringify({ type: "reply", id: message.id, ...answer(message.params) }));
      };
    });
    const deadline = Date.now() + 3000;
    while (!hub.isOnline(runtime.id)) {
      if (Date.now() > deadline) throw new Error("timed out");

      await Bun.sleep(20);
    }
    return { thread, calls };
  }

  const get = (path: string, token: string | undefined) =>
    fetch(`http://${base}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

  test("asks the runner for the scope and returns its patch", async () => {
    const { thread, calls } = await setup(() => ({
      ok: true,
      result: { patch: "diff --git a/x b/x\n", truncated: false },
    }));
    const turn = await get(`/threads/${thread.id}/diff`, owner.token);
    expect(turn.status).toBe(200);
    expect(await turn.json()).toEqual({
      available: true,
      patch: "diff --git a/x b/x\n",
      truncated: false,
    });
    await get(`/threads/${thread.id}/diff?scope=all`, owner.token);
    expect(calls).toEqual([
      { threadId: thread.id, scope: "turn" },
      { threadId: thread.id, scope: "all" },
    ]);
  });

  test("says so when the thread has no workspace yet", async () => {
    const { thread } = await setup(() => ({ ok: true, result: null }));
    const response = await get(`/threads/${thread.id}/diff`, owner.token);
    expect(await response.json()).toEqual({ available: false });
  });

  test("hides a runtime's own error and an answer it should not give", async () => {
    const failing = await setup(() => ({ ok: false, error: "fatal: secret path /home/x" }));
    const failed = await get(`/threads/${failing.thread.id}/diff`, owner.token);
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("secret");

    const odd = await setup(() => ({ ok: true, result: { patch: 3 } }));
    expect((await get(`/threads/${odd.thread.id}/diff`, owner.token)).status).toBe(503);
  });

  test("refuses a stranger, another organization and an unknown scope", async () => {
    const { thread, calls } = await setup(() => ({
      ok: true,
      result: { patch: "", truncated: false },
    }));
    expect((await get(`/threads/${thread.id}/diff`, undefined)).status).toBe(401);
    expect((await get(`/threads/${thread.id}/diff`, outsider.token)).status).toBe(404);
    expect((await get(`/threads/${thread.id}/diff?scope=everything`, owner.token)).status).toBe(
      422,
    );
    expect(calls).toEqual([]);
  });
});
