import { afterAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { db } from "@aven/db/client";
import { organizations } from "@aven/db/schema/organizations";
import { users } from "@aven/db/schema/users";
import { eq } from "drizzle-orm";

import { errorsRouter } from "../../errors";
import { auth, authService } from "../auth/service";
import type { GithubClient, GithubUserGrant } from "./client";
import { githubRouter } from "./router";
import { createGithubService, createState, readState } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("connecting a GitHub account (real postgres, GitHub faked)", async () => {
  process.env.BETTER_AUTH_SECRET ??= "test-secret";
  const grant: GithubUserGrant = {
    accessToken: "ghu_a",
    expiresAt: null,
    refreshToken: null,
    refreshExpiresAt: null,
  };
  const exchanged: string[] = [];
  const kept: { userId: string; grant: GithubUserGrant }[] = [];
  let connectedLogin: string | null = null;

  const client = {
    authorizeUrl: (state: string) => `https://github.test/authorize?state=${state}`,
    exchangeCode: async (code: string) => {
      exchanged.push(code);
      return code === "good" ? grant : null;
    },
  } as unknown as GithubClient;
  const service = createGithubService(client, {
    connect: async (userId, given) => {
      kept.push({ userId, grant: given });
      return { id: 42, login: "ada", name: null };
    },
  });
  const server = new Elysia()
    .use(errorsRouter)
    .use(
      githubRouter(service, {
        status: async () => (connectedLogin ? { login: connectedLogin } : null),
      }),
    )
    .listen({ port: 0 });
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
  organizationIds.push(owner.organizationId);

  afterAll(async () => {
    await server.stop(true);
    for (const email of emails) await db.delete(users).where(eq(users.email, email));
    for (const id of organizationIds)
      await db.delete(organizations).where(eq(organizations.id, id));
  });

  const get = (path: string, token: string | undefined = owner.token) =>
    fetch(`${base}${path}`, {
      redirect: "manual",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  const reset = () => {
    exchanged.length = 0;
    kept.length = 0;
    connectedLogin = null;
  };

  test("says whether the person has connected their account", async () => {
    reset();
    expect(await (await get("/github/user")).json()).toEqual({ connected: false, login: null });
    connectedLogin = "ada";
    expect(await (await get("/github/user")).json()).toEqual({ connected: true, login: "ada" });
    expect((await get("/github/user", "")).status).toBe(401);
  });

  test("sends the browser to GitHub with a state that remembers where to come back to", async () => {
    reset();
    const response = await get("/github/connect?next=/threads/abc");

    expect(response.status).toBe(302);
    const state = new URL(response.headers.get("location")!).searchParams.get("state")!;
    expect(readState(state, owner.organizationId, owner.userId)).toEqual({ next: "/threads/abc" });
  });

  test("will not remember a place on another site", async () => {
    reset();
    expect((await get("/github/connect?next=https://evil.test/x")).status).toBe(422);
    expect((await get("/github/connect?next=//evil.test/x")).status).toBe(422);
  });

  test("keeps the token of a person who only connects, and sends them back", async () => {
    reset();
    const state = createState(owner.organizationId, owner.userId, Date.now(), "/threads/abc");

    const response = await get(`/github/callback?code=good&state=${state}`);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/threads/abc");
    expect(kept).toEqual([{ userId: owner.userId, grant }]);
  });

  test("keeps nothing for a state that is not theirs or a code GitHub does not accept", async () => {
    reset();
    const mine = createState(owner.organizationId, owner.userId);
    const another = createState(owner.organizationId, "someone-else");

    expect((await get(`/github/callback?code=good&state=${another}`)).status).toBe(422);
    expect((await get(`/github/callback?code=bad&state=${mine}`)).status).toBe(422);
    expect((await get(`/github/callback?state=${mine}`)).status).toBe(422);
    expect(kept).toEqual([]);
  });
});
