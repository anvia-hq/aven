import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { organizations } from "@aven/db/schema/organizations";
import { users } from "@aven/db/schema/users";
import { WIRE_VERSION, type ControlPlaneToRuntime } from "@aven/protocol/runtime-wire";
import { eq } from "drizzle-orm";

import { errorsRouter } from "../../errors";
import { createMemoryStore } from "../../memory-store";
import { auth, authService } from "../auth/service";
import { RuntimeHub } from "./hub";
import { runtimesRouter } from "./router";
import { runtimesService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("asking a runner to update itself (real postgres, real WebSocket)", () => {
  const hub = new RuntimeHub(createMemoryStore(db));
  const server = new Elysia().use(errorsRouter).use(runtimesRouter(hub)).listen({ port: 0 });
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

  type Person = Awaited<ReturnType<typeof signUp>>;
  let owner!: Person;
  let outsider!: Person;
  let plain!: Person;
  let asMember = false;

  beforeAll(async () => {
    owner = await signUp("owner");
    outsider = await signUp("outsider");
    plain = await signUp("plain");
    organizationIds.push(owner.organizationId, outsider.organizationId, plain.organizationId);
    await db.insert(members).values({
      id: `m-${plain.userId}`,
      organizationId: owner.organizationId,
      userId: plain.userId,
      role: "member",
    });
    const url = process.env.BETTER_AUTH_URL ?? "http://localhost:5173";
    const switched = await auth.handler(
      new Request(`${url}/auth/organization/set-active`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${plain.token}` },
        body: JSON.stringify({ organizationId: owner.organizationId }),
      }),
    );
    asMember = switched.ok;
  });

  afterAll(async () => {
    for (const socket of sockets) socket.close();
    await server.stop(true);
    for (const email of emails) await db.delete(users).where(eq(users.email, email));
    for (const id of organizationIds)
      await db.delete(organizations).where(eq(organizations.id, id));
  });

  async function connect(
    hello: { build?: string; canUpdate?: boolean },
    answer: Record<string, unknown> = { status: "started" },
  ) {
    const { runtime, token } = await runtimesService.create(owner.organizationId, owner.userId, {
      name: "r",
    });
    const calls: unknown[] = [];
    await new Promise<void>((resolve, reject) => {
      const init = { headers: { authorization: `Bearer ${token}` } };
      const ws = new WebSocket(`ws://${base}/runtimes/connect`, init as unknown as string[]);
      sockets.push(ws);
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "hello", version: WIRE_VERSION, runs: [], ...hello }));
        resolve();
      };
      ws.onerror = () => reject(new Error("runtime could not connect"));
      ws.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as ControlPlaneToRuntime;
        if (message.type !== "call" || message.method !== "runner.update") return;
        calls.push(message.params);
        ws.send(JSON.stringify({ type: "reply", id: message.id, ok: true, result: answer }));
      };
    });
    const deadline = Date.now() + 3000;
    while (!hub.isOnline(runtime.id)) {
      if (Date.now() > deadline) throw new Error("timed out");
      await Bun.sleep(20);
    }
    return { runtime, calls };
  }

  const request = (method: string, path: string, token: string) =>
    fetch(`http://${base}/runtimes${path}`, {
      method,
      headers: { authorization: `Bearer ${token}` },
    });
  const releaseBefore = process.env.AVEN_VERSION;
  beforeAll(() => {
    process.env.AVEN_VERSION = "9.9.9";
  });
  afterAll(() => {
    if (releaseBefore === undefined) delete process.env.AVEN_VERSION;
    else process.env.AVEN_VERSION = releaseBefore;
  });

  test("an owner has an agreeing runner update to the server's release, and the list says it can", async () => {
    {
      const { runtime, calls } = await connect({ build: "9.9.0", canUpdate: true });

      const listed = (await (await request("GET", "", owner.token)).json()) as {
        id: string;
        canUpdate: boolean;
        outdated: boolean;
      }[];
      expect(listed.find((row) => row.id === runtime.id)).toMatchObject({
        canUpdate: true,
        outdated: true,
      });

      const response = await request("POST", `/${runtime.id}/update`, owner.token);
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ status: "started" });
      expect(calls).toEqual([{ release: "9.9.9" }]);
    }
  });

  test("a runner already on the server's release is not asked, and a release the person did not see is refused", async () => {
    const current = await connect({ build: "9.9.9", canUpdate: true });
    const same = await request("POST", `/${current.runtime.id}/update`, owner.token);
    expect(same.status).toBe(409);
    expect(await same.text()).toContain("already up to date");

    const behind = await connect({ build: "9.9.0", canUpdate: true });
    const stale = await fetch(`http://${base}/runtimes/${behind.runtime.id}/update`, {
      method: "POST",
      headers: { authorization: `Bearer ${owner.token}`, "content-type": "application/json" },
      body: JSON.stringify({ release: "9.9.5" }),
    });
    expect(stale.status).toBe(409);
    expect(await stale.text()).toContain("now 9.9.9");
    expect(current.calls).toEqual([]);
    expect(behind.calls).toEqual([]);
  });

  test("a runner that is not an installed aven, or is busy, or is offline, is a refusal that says why", async () => {
    const plainRunner = await connect({ build: "9.9.0" });
    const refused = await request("POST", `/${plainRunner.runtime.id}/update`, owner.token);
    expect(refused.status).toBe(409);
    expect(await refused.text()).toContain("not installed with aven");
    expect(plainRunner.calls).toEqual([]);

    const busy = await connect(
      { build: "9.9.0", canUpdate: true },
      { status: "busy", reason: "A run is going on this runner." },
    );
    const waiting = await request("POST", `/${busy.runtime.id}/update`, owner.token);
    expect(waiting.status).toBe(409);
    expect(await waiting.text()).toContain("A run is going");

    const { runtime: offline } = await runtimesService.create(owner.organizationId, owner.userId, {
      name: "off",
    });
    expect((await request("POST", `/${offline.id}/update`, owner.token)).ok).toBe(false);
  });

  test("a runner that answers with something else is unavailable, not a server error", async () => {
    const { runtime } = await connect({ build: "9.9.0", canUpdate: true }, { status: "maybe" });
    const response = await request("POST", `/${runtime.id}/update`, owner.token);
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("did not answer the update");
  });

  test("a plain member is refused, and another workspace's runner is not found", async () => {
    expect(asMember).toBe(true);
    const { runtime, calls } = await connect({ build: "9.9.0", canUpdate: true });
    expect((await request("POST", `/${runtime.id}/update`, plain.token)).status).toBe(403);
    expect((await request("POST", `/${runtime.id}/update`, outsider.token)).status).toBe(404);
    expect(calls).toEqual([]);
  });
});
