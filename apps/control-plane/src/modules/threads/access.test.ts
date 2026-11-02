import { afterAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { sessions } from "@aven/db/schema/sessions";
import { eq } from "drizzle-orm";

import { errorsRouter } from "../../errors";
import { createMemoryStore } from "../../memory-store";
import { artifactsRouter } from "../artifacts/router";
import { desktopRouter } from "../desktop/router";
import { diffRouter } from "../diff/router";
import { filesRouter } from "../files/router";
import { processesRouter } from "../processes/router";
import { RuntimeHub } from "../runtimes/hub";
import { runtimesService } from "../runtimes/service";
import type { RunManager } from "../runs/service";
import { shipRouter } from "../ship/router";
import { terminalRouter } from "../terminal/router";
import { createShipService } from "../ship/service";
import type { ThreadMessages } from "./messages";
import { threadsRouter } from "./router";
import { threadsService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

// Who may do what with a thread (decision 0084), through every route that has a thread's id: the
// creator all of it, a teammate nothing of a private thread and, once it is shared, only reading.
run("a thread's access (real postgres)", async () => {
  const { seedProject } = await import("../../testing/seed-project");
  const { signUp } = await import("../../testing/sign-up");
  const hub = new RuntimeHub(createMemoryStore(db));
  // The runs and messages do nothing here: what is asked is whether a request gets that far.
  const runs = {
    isRunning: () => false,
    history: async () => [],
    cancel: () => false,
    async *events() {},
  } as unknown as RunManager;
  const messages = { send: async () => {}, answer: async () => {} } as unknown as ThreadMessages;
  const server = new Elysia()
    .use(errorsRouter)
    .use(threadsRouter(runs, messages))
    .use(filesRouter(hub))
    .use(diffRouter(hub))
    .use(artifactsRouter(hub))
    .use(processesRouter(hub))
    .use(desktopRouter(hub))
    .use(terminalRouter(hub))
    .use(shipRouter(createShipService(hub, { send: async () => {} })))
    .listen({ port: 0 });
  const base = `http://localhost:${server.server?.port}`;

  const owner = await signUp("owner");
  const mate = await signUp("mate");
  // The teammate joins the owner's workspace and works in it.
  await db.insert(members).values({
    id: crypto.randomUUID(),
    organizationId: owner.organizationId,
    userId: mate.userId,
    role: "member",
  });
  await db
    .update(sessions)
    .set({ activeOrganizationId: owner.organizationId })
    .where(eq(sessions.userId, mate.userId));

  const { runtime } = await runtimesService.create(owner.organizationId, owner.userId, {
    name: "r",
  });
  const { project } = await seedProject(owner.organizationId, owner.userId, runtime.id, "shared");
  const thread = await threadsService.create(owner.organizationId, owner.userId, {
    projectId: project.id,
  });

  afterAll(async () => {
    await server.stop(true);
    await mate.remove();
    await owner.remove();
  });

  const call = (method: string, path: string, token: string, body?: object) =>
    fetch(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  const id = thread.id;
  // Routes that only look, and routes that act. Each carries what it needs to pass validation, so
  // the answer is the access check's.
  const reading: [string, string][] = [
    ["GET", `/threads/${id}`],
    ["GET", `/threads/${id}/files?path=`],
    ["GET", `/threads/${id}/files/content?path=a.txt`],
    ["GET", `/threads/${id}/files/search?q=a`],
    ["GET", `/threads/${id}/diff?scope=all`],
    ["GET", `/threads/${id}/artifacts/${crypto.randomUUID()}.png`],
  ];
  const acting: [string, string, object?][] = [
    ["PATCH", `/threads/${id}`, { title: "hijack" }],
    ["POST", `/threads/${id}/messages`, { prompt: "hello" }],
    ["POST", `/threads/${id}/answer`, { answers: [{ questionId: "q", value: "a" }] }],
    ["POST", `/threads/${id}/cancel`],
    ["GET", `/threads/${id}/ship`],
    ["POST", `/threads/${id}/ship`],
    ["GET", `/threads/${id}/processes`],
    ["POST", `/threads/${id}/processes/p1/stop`],
    ["GET", `/threads/${id}/processes/p1/logs`],
    ["GET", `/threads/${id}/desktop`],
    ["POST", `/threads/${id}/desktop/wake`],
    ["POST", `/threads/${id}/desktop/takeover`],
    ["POST", `/threads/${id}/desktop/release`],
  ];

  test("a private thread is not found by a teammate, whatever they ask", async () => {
    for (const [method, path, body] of [...reading, ...acting]) {
      const response = await call(method, path, mate.token, body);
      expect([method, path, response.status]).toEqual([method, path, 404]);
    }
    const list = (await (await call("GET", "/threads", mate.token)).json()) as { id: string }[];
    expect(list.map((row) => row.id)).not.toContain(id);
  });

  test("its creator gets past the check on every route", async () => {
    for (const [method, path, body] of [...reading, ...acting]) {
      const response = await call(method, path, owner.token, body);
      // The runner is offline and the project has no GitHub: anything but not found is past it.
      expect([method, path, response.status === 404]).toEqual([method, path, false]);
    }
  });

  test("a shared thread can be read by a teammate and nothing more", async () => {
    const shared = await call("PATCH", `/threads/${id}`, owner.token, { visibility: "workspace" });
    expect(shared.status).toBe(200);

    for (const [method, path] of reading) {
      const response = await call(method, path, mate.token);
      expect([method, path, response.status === 404]).toEqual([method, path, false]);
    }
    for (const [method, path, body] of acting) {
      const response = await call(method, path, mate.token, body);
      expect([method, path, response.status]).toEqual([method, path, 404]);
    }
    const list = (await (await call("GET", "/threads", mate.token)).json()) as { id: string }[];
    expect(list.map((row) => row.id)).toContain(id);
  });

  test("unsharing takes it away again", async () => {
    await call("PATCH", `/threads/${id}`, owner.token, { visibility: "private" });
    expect((await call("GET", `/threads/${id}`, mate.token)).status).toBe(404);
  });

  // Whether a socket is let through the upgrade: it opens, or the request is refused first.
  const upgrades = (path: string, token: string) =>
    new Promise<boolean>((resolve) => {
      // Bun takes headers here; its type for the second argument only knows protocols.
      const init = { headers: { authorization: `Bearer ${token}` } };
      const socket = new WebSocket(
        `${base.replace("http", "ws")}${path}`,
        init as unknown as string[],
      );
      socket.onopen = () => {
        socket.close();
        resolve(true);
      };
      socket.onerror = () => resolve(false);
    });
  const sockets = [
    `/threads/${id}/desktop/stream`,
    `/threads/${id}/terminal/stream?cols=80&rows=24`,
  ];

  test("a teammate cannot open the Desktop or the Terminal of a thread, shared or not", async () => {
    for (const visibility of ["private", "workspace"] as const) {
      await call("PATCH", `/threads/${id}`, owner.token, { visibility });
      for (const path of sockets) {
        expect([visibility, path, await upgrades(path, mate.token)]).toEqual([
          visibility,
          path,
          false,
        ]);
        expect([visibility, path, await upgrades(path, owner.token)]).toEqual([
          visibility,
          path,
          true,
        ]);
      }
    }
    await call("PATCH", `/threads/${id}`, owner.token, { visibility: "private" });
  });
});
