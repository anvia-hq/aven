import { afterAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { createMemoryStore } from "@aven/agents/memory";
import { db } from "@aven/db/client";
import { organizations } from "@aven/db/schema/organizations";
import { users } from "@aven/db/schema/users";
import { WIRE_VERSION, type ControlPlaneToRuntime } from "@aven/protocol/runtime-wire";
import { eq } from "drizzle-orm";

import { errorsRouter } from "../../errors";
import { auth, authService } from "../auth/service";
import { GithubNoPushAccessError, GithubWriteNotGrantedError } from "../github/client";
import { connectRouter } from "../runtimes/connect";
import { RuntimeHub } from "../runtimes/hub";
import { runtimesService } from "../runtimes/service";
import { threadsService } from "../threads/service";
import { shipRouter } from "./router";
import { createShipService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

type Answer = { ok: boolean; result?: unknown; error?: string };

run("shipping a thread (real postgres, real WebSocket, GitHub faked)", async () => {
  const { seedProject } = await import("../../testing/seed-project");
  const hub = new RuntimeHub(createMemoryStore(db));

  // A GitHub that records what it was asked, and can refuse: the app not approved to write, the
  // person unable to push, or the person not connected.
  const pulled: { token: string; input: unknown }[] = [];
  const checked: string[] = [];
  let approved = true;
  let canPush = true;
  let connected = true;
  const identity = { id: 42, login: "ada", name: "Ada L" };
  const github = {
    requireWritable: async () => {
      if (!approved) throw new GithubWriteNotGrantedError("acme");
    },
    requirePush: async (token: string, fullName: string) => {
      checked.push(`${token} ${fullName}`);
      if (!canPush) throw new GithubNoPushAccessError(fullName);
    },
    openPullRequest: async (token: string, input: unknown) => {
      pulled.push({ token, input });
      return { number: 5, url: "https://github.com/acme/app/pull/5", created: true };
    },
  };
  const userTokens = {
    use: async () => (connected ? { token: "ghu_user", identity } : null),
  };
  let running = false;
  const drafted = { title: "Add a greeting", body: "Says hello." };
  const drafts: string[] = [];
  const service = createShipService(hub, {
    github,
    userTokens,
    runs: { isRunning: () => running },
    draft: async (_org, userId) => {
      drafts.push(userId);
      return drafted;
    },
  });

  const server = new Elysia()
    .use(errorsRouter)
    .use(connectRouter(hub))
    .use(shipRouter(hub, service))
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
      email,
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

  // A thread on a runner that answers `repo.push` with `answer`; the calls it got are in `calls`.
  async function setup(answer: Answer) {
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
    const calls: Record<string, unknown>[] = [];
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
        if (message.type !== "call" || message.method !== "repo.push") return;
        calls.push(message.params as Record<string, unknown>);
        ws.send(JSON.stringify({ type: "reply", id: message.id, ...answer }));
      };
    });
    const deadline = Date.now() + 3000;
    while (!hub.isOnline(runtime.id)) {
      if (Date.now() > deadline) throw new Error("timed out");
      await Bun.sleep(20);
    }
    return { thread, project, calls };
  }

  const ship = (threadId: string, token: string | undefined) =>
    fetch(`http://${base}/threads/${threadId}/ship`, {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  const reset = () => {
    pulled.length = 0;
    checked.length = 0;
    drafts.length = 0;
    approved = true;
    canPush = true;
    connected = true;
    running = false;
  };

  test("pushes through the runner as the person, opens a draft pull request as them and keeps it on the thread", async () => {
    reset();
    const { thread, project, calls } = await setup({
      ok: true,
      result: { kind: "pushed", commit: "abc123" },
    });

    const response = await ship(thread.id, owner.token);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      number: 5,
      url: "https://github.com/acme/app/pull/5",
      created: true,
    });
    expect(calls).toEqual([
      {
        threadId: thread.id,
        cloneUrl: project.cloneUrl,
        branch: `aven/${thread.id.slice(0, 8)}`,
        token: "ghu_user",
        commitMessage: "Add a greeting",
        // Their GitHub account, not the email of their Aven account.
        author: { name: "Ada L", email: "42+ada@users.noreply.github.com" },
      },
    ]);
    expect(checked).toEqual([`ghu_user ${project.repoFullName}`]);
    expect(drafts).toEqual([owner.userId]);
    expect(pulled).toEqual([
      {
        token: "ghu_user",
        input: {
          fullName: project.repoFullName,
          head: `aven/${thread.id.slice(0, 8)}`,
          base: "main",
          title: "Add a greeting",
          body: "Says hello.",
          draft: true,
        },
      },
    ]);
    const saved = await threadsService.get(owner.organizationId, thread.id);
    expect(saved).toMatchObject({
      pullRequestNumber: 5,
      pullRequestUrl: "https://github.com/acme/app/pull/5",
    });
  });

  test("says so when there is nothing to ship or no workspace, and opens nothing", async () => {
    reset();
    const nothing = await setup({ ok: true, result: { kind: "nothing" } });
    const none = await setup({ ok: true, result: null });

    expect((await ship(nothing.thread.id, owner.token)).status).toBe(409);
    expect((await ship(none.thread.id, owner.token)).status).toBe(409);
    expect(pulled).toEqual([]);
  });

  test("waits for a run that is still going, without asking the runner or GitHub", async () => {
    reset();
    running = true;
    const { thread, calls } = await setup({ ok: true, result: { kind: "nothing" } });

    expect((await ship(thread.id, owner.token)).status).toBe(409);
    expect(calls).toEqual([]);
    expect(checked).toEqual([]);
  });

  test("a person who has not connected GitHub is told to, and nothing is asked of the runner or GitHub", async () => {
    reset();
    connected = false;
    const { thread, calls } = await setup({ ok: true, result: { kind: "nothing" } });

    const response = await ship(thread.id, owner.token);

    expect(response.status).toBe(409);
    expect(await response.text()).toBe("Connect your GitHub account to ship");
    expect(calls).toEqual([]);
    expect(checked).toEqual([]);
  });

  test("an app that has not been approved to write is a 409, and the runner is not asked", async () => {
    reset();
    approved = false;
    const { thread, calls } = await setup({ ok: true, result: { kind: "nothing" } });

    const response = await ship(thread.id, owner.token);

    expect(response.status).toBe(409);
    expect(await response.text()).toContain("Approve its new permissions");
    expect(calls).toEqual([]);
  });

  test("a person who cannot push to the repository cannot ship to it", async () => {
    reset();
    canPush = false;
    const { thread, project, calls } = await setup({ ok: true, result: { kind: "nothing" } });

    const response = await ship(thread.id, owner.token);

    expect(response.status).toBe(409);
    expect(await response.text()).toBe(
      `You do not have write access to ${project.repoFullName} on GitHub`,
    );
    expect(calls).toEqual([]);
  });

  test("hides a runtime's own error and an answer it should not give", async () => {
    reset();
    const failing = await setup({ ok: false, error: "fatal: token ghu_user at /home/x" });
    const failed = await ship(failing.thread.id, owner.token);
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("ghu_user");

    const odd = await setup({ ok: true, result: { kind: "merged" } });
    expect((await ship(odd.thread.id, owner.token)).status).toBe(503);
    expect(pulled).toEqual([]);
  });

  test("refuses a stranger and another organization", async () => {
    reset();
    const { thread, calls } = await setup({ ok: true, result: { kind: "nothing" } });

    expect((await ship(thread.id, undefined)).status).toBe(401);
    expect((await ship(thread.id, outsider.token)).status).toBe(404);
    expect(calls).toEqual([]);
    expect(checked).toEqual([]);
  });
});
