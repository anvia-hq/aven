import { afterAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { db } from "@aven/db/client";
import { organizations } from "@aven/db/schema/organizations";
import { users } from "@aven/db/schema/users";
import { eq } from "drizzle-orm";

import { errorsRouter } from "@aven/server-kit/errors";
import { auth, authService } from "../auth/service";
import type { RuntimeHub } from "../runtimes/hub";
import { runtimesService } from "../runtimes/service";
import { threadsService } from "../threads/service";
import { shipRouter } from "./router";
import { createShipService, GithubNotConnectedError } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("shipping a thread over HTTP (real postgres and auth, GitHub and the run faked)", async () => {
  const { seedProject } = await import("../../testing/seed-project");

  const sent: { userId: string; threadId: string; prompt: string; body: object }[] = [];
  let connected = true;
  let workspaceFiles: string[] = [];
  const service = createShipService({ get: () => undefined } as unknown as RuntimeHub, {
    userTokens: {
      use: async () =>
        connected ? { token: "ghu_a", identity: { id: 42, login: "ada", name: null } } : null,
    },
    github: {
      appKeyOf: async () => "platform",
      requireWritable: async () => undefined,
      requirePush: async () => undefined,
    },
    readShipFile: async () => null,
    hasFile: async (_org, _thread, path) => workspaceFiles.includes(path),
    send: async (_org, userId, threadId, body) => {
      sent.push({ userId, threadId, prompt: body.prompt, body });
    },
  });
  const server = new Elysia().use(errorsRouter).use(shipRouter(service)).listen({ port: 0 });
  const base = `http://localhost:${server.server?.port}`;
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
  const { runtime } = await runtimesService.create(owner.organizationId, owner.userId, {
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

  afterAll(async () => {
    await server.stop(true);
    for (const email of emails) await db.delete(users).where(eq(users.email, email));
    for (const id of organizationIds)
      await db.delete(organizations).where(eq(organizations.id, id));
  });

  const ship = (id: string, token: string | undefined, body?: object) => {
    const headers = new Headers();

    if (token) headers.set("authorization", `Bearer ${token}`);

    if (body) headers.set("content-type", "application/json");

    return fetch(`${base}/threads/${id}/ship`, {
      method: "POST",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  test("answers 202 and has the agent sent the ship prompt, as the person", async () => {
    sent.length = 0;
    connected = true;

    const response = await ship(thread.id, owner.token);

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ userId: owner.userId, threadId: thread.id });
    expect(sent[0]!.prompt).toContain(`This thread's branch is aven/${thread.id.slice(0, 8)}`);
    expect(sent[0]!.prompt).toContain("default branch is main");
  });

  test("says whether the repository is set up to ship, to the thread's own organization", async () => {
    const readiness = (token: string | undefined) => {
      const headers = new Headers();

      if (token) headers.set("authorization", `Bearer ${token}`);

      return fetch(`${base}/threads/${thread.id}/ship`, { headers });
    };

    workspaceFiles = [];
    expect(await (await readiness(owner.token)).json()).toEqual({
      ready: false,
      ship: false,
      appKey: "platform",
      machine: false,
      githubMode: "machine",
      runnerGithub: null,
    });
    workspaceFiles = [".aven/ship.md"];
    expect(await (await readiness(owner.token)).json()).toEqual({
      ready: true,
      ship: true,
      appKey: "platform",
      machine: false,
      githubMode: "machine",
      runnerGithub: null,
    });

    expect((await readiness(undefined)).status).toBe(401);
    expect((await readiness(outsider.token)).status).toBe(404);
    workspaceFiles = [];
  });

  test("a person who has not connected GitHub gets a 409 that says so", async () => {
    sent.length = 0;
    connected = false;

    const response = await ship(thread.id, owner.token);

    expect(response.status).toBe(409);
    expect(await response.text()).toBe(new GithubNotConnectedError().message);
    expect(sent).toEqual([]);
    connected = true;
  });

  test("refuses a stranger, and another organization's thread is not found", async () => {
    sent.length = 0;

    expect((await ship(thread.id, undefined)).status).toBe(401);
    expect((await ship(thread.id, outsider.token)).status).toBe(404);
    expect(sent).toEqual([]);
  });

  test("a thread with a pull request is shipped as a new one when the body says so", async () => {
    sent.length = 0;
    const shipped = await threadsService.create(owner.organizationId, owner.userId, {
      projectId: project.id,
    });
    await threadsService.savePullRequests(shipped.id, [
      {
        number: 4,
        url: "https://github.com/acme/app/pull/4",
        branch: `aven/${shipped.id.slice(0, 8)}`,
        title: "First",
        state: "open",
      },
    ]);

    expect((await ship(shipped.id, owner.token)).status).toBe(202);
    expect((await ship(shipped.id, owner.token, { mode: "new" })).status).toBe(202);

    expect(sent[0]!.prompt).toContain("updated by the push: do not open another");
    expect(sent[1]!.prompt).toContain(`git switch -c aven/${shipped.id.slice(0, 8)}-<short-slug>`);
    expect(sent[1]!.prompt).toContain("- #4 open");
    expect(sent[1]!.body).not.toHaveProperty("mode");
  });

  test("a mode that is neither update nor new is refused and nothing is sent", async () => {
    sent.length = 0;

    const response = await ship(thread.id, owner.token, { mode: "force" });

    expect(response.status).toBe(422);
    expect(sent).toEqual([]);
  });
});
