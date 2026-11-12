import { afterAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { db } from "@aven/db/client";
import { organizations } from "@aven/db/schema/organizations";
import { users } from "@aven/db/schema/users";
import { WIRE_VERSION } from "@aven/protocol/runtime-wire";
import { eq } from "drizzle-orm";

import { errorsRouter } from "../../errors";
import { createMemoryStore } from "../../memory-store";
import { auth, authService } from "../auth/service";
import { connectRouter } from "../runtimes/connect";
import { RuntimeHub } from "../runtimes/hub";
import { runtimesService } from "../runtimes/service";
import { threadsService } from "../threads/service";
import { artifactsRouter } from "./router";
import type { ControlPlaneToRuntime } from "@aven/protocol/types";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("the images a thread's agent showed (real postgres, real WebSocket)", async () => {
  const { seedProject } = await import("../../testing/seed-project");
  const hub = new RuntimeHub(createMemoryStore(db));
  const server = new Elysia()
    .use(errorsRouter)
    .use(connectRouter(hub))
    .use(artifactsRouter(hub))
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

        if (message.type !== "call" || message.method !== "artifacts.read") return;

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
  const name = "00000000-0000-4000-8000-000000000001.png";

  test("serves the image the runner keeps, as its bytes", async () => {
    const { thread, calls } = await setup(() => ({
      ok: true,
      result: { mediaType: "image/png", data: "AQID" },
    }));
    const response = await get(`/threads/${thread.id}/artifacts/${name}`, owner.token);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(calls).toEqual([{ threadId: thread.id, name }]);
  });

  test("serves an HTML page sandboxed, with the bridge, and never in pieces", async () => {
    const page = "<!doctype html><html><head></head><body>hi</body></html>";
    const { thread } = await setup(() => ({
      ok: true,
      result: { mediaType: "text/html", data: Buffer.from(page).toString("base64") },
    }));
    const htmlName = "00000000-0000-4000-8000-000000000002.html";
    const response = await fetch(`http://${base}/threads/${thread.id}/artifacts/${htmlName}`, {
      headers: { authorization: `Bearer ${owner.token}`, range: "bytes=0-3" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toStartWith("text/html");
    expect(response.headers.get("content-security-policy")).toContain("sandbox allow-scripts");
    const body = await response.text();
    expect(body).toContain("<script>");
    expect(body).toContain("<body>hi</body>");
  });

  test("is not found when the runner has no such image", async () => {
    const { thread } = await setup(() => ({ ok: true, result: null }));
    expect((await get(`/threads/${thread.id}/artifacts/${name}`, owner.token)).status).toBe(404);
  });

  test("hides a runtime's own error and refuses an image type it should not send", async () => {
    const failing = await setup(() => ({ ok: false, error: "EACCES /home/x/secret" }));
    const failed = await get(`/threads/${failing.thread.id}/artifacts/${name}`, owner.token);
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("secret");

    const svg = await setup(() => ({ ok: true, result: { mediaType: "image/svg+xml", data: "" } }));
    const odd = await get(`/threads/${svg.thread.id}/artifacts/${name}`, owner.token);
    expect(odd.status).toBe(503);
  });

  test("refuses a stranger, another organization and a name a runner does not give", async () => {
    const { thread, calls } = await setup(() => ({ ok: true, result: null }));
    const path = `/threads/${thread.id}/artifacts/${name}`;
    expect((await get(path, undefined)).status).toBe(401);
    expect((await get(path, outsider.token)).status).toBe(404);
    const traversal = `/threads/${thread.id}/artifacts/..%2F..%2Fruns.db`;
    expect((await get(traversal, owner.token)).status).toBe(422);
    expect((await get(`/threads/${thread.id}/artifacts/a.svg`, owner.token)).status).toBe(422);
    expect(calls).toEqual([]);
  });

  test("serves a video in pieces, as a browser asks for it, and refuses a range outside it", async () => {
    const video = "00000000-0000-4000-8000-000000000002.mp4";
    const { thread } = await setup(() => ({
      ok: true,
      result: { mediaType: "video/mp4", data: Buffer.from("0123456789").toString("base64") },
    }));
    const path = `/threads/${thread.id}/artifacts/${video}`;
    const piece = await fetch(`http://${base}${path}`, {
      headers: { authorization: `Bearer ${owner.token}`, range: "bytes=2-5" },
    });
    expect(piece.status).toBe(206);
    expect(piece.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(piece.headers.get("content-type")).toBe("video/mp4");
    expect(await piece.text()).toBe("2345");

    const whole = await get(path, owner.token);
    expect(whole.status).toBe(200);
    expect(whole.headers.get("accept-ranges")).toBe("bytes");
    expect(await whole.text()).toBe("0123456789");

    const outside = await fetch(`http://${base}${path}`, {
      headers: { authorization: `Bearer ${owner.token}`, range: "bytes=50-" },
    });
    expect(outside.status).toBe(416);
    expect(outside.headers.get("content-range")).toBe("bytes */10");
  });
});
