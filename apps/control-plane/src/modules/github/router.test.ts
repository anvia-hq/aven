import { afterAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { db } from "@aven/db/client";
import { organizations } from "@aven/db/schema/organizations";
import { users } from "@aven/db/schema/users";
import { eq } from "drizzle-orm";

import { ConflictError, errorsRouter, ForbiddenError } from "../../errors";
import { auth, authService } from "../auth/service";
import type { githubAppSetup } from "./app-setup";
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
    slug: "aven-test",
    authorizeUrl: (state: string) => `https://github.test/authorize?state=${state}`,
    exchangeCode: async (code: string) => {
      exchanged.push(code);
      return code === "good" ? grant : null;
    },
    userCanUse: async (_token: string, installationId: number) => installationId !== 999,
    installation: async (installationId: number) => ({ installationId, accountLogin: "acme" }),
  } as unknown as GithubClient;
  const service = createGithubService(client, {
    connect: async (userId, given) => {
      kept.push({ userId, grant: given });
      return { id: 42, login: "ada", name: null };
    },
  });
  const setupCalls: { call: string; arg: unknown }[] = [];
  let setupRefused: Error | null = null;
  const appSetup = {
    canSetUp: (email: string) => email.startsWith("owner"),
    manifest: (_person: unknown, options: unknown) => {
      if (setupRefused) throw setupRefused;
      setupCalls.push({ call: "manifest", arg: options });
      return {
        postUrl: "https://github.test/settings/apps/new?state=s",
        manifest: { name: "Aven" },
      };
    },
    complete: async (_person: unknown, input: unknown) => {
      if (setupRefused) throw setupRefused;
      setupCalls.push({ call: "complete", arg: input });
    },
  } as unknown as Pick<typeof githubAppSetup, "canSetUp" | "manifest" | "complete">;
  const server = new Elysia()
    .use(errorsRouter)
    .use(
      githubRouter(
        service,
        { status: async () => (connectedLogin ? { login: connectedLogin } : null) },
        appSetup,
      ),
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

  test("tells a platform owner they can set the app up", async () => {
    const body = (await (await get("/github")).json()) as { canSetUp: boolean };
    expect(body.canSetUp).toBe(true);
  });

  test("gives the manifest, passing the name and organization asked for", async () => {
    setupCalls.length = 0;
    const response = await get("/github/app/manifest?name=Acme%20Aven&organization=acme");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      postUrl: expect.stringContaining("github.test"),
    });
    expect(setupCalls).toEqual([
      { call: "manifest", arg: { name: "Acme Aven", organization: "acme" } },
    ]);
    expect((await get("/github/app/manifest?organization=not%20valid!")).status).toBe(422);
    expect((await get("/github/app/manifest?public=maybe")).status).toBe(422);
    expect((await get("/github/app/manifest", "")).status).toBe(401);
  });

  test("passes on that the app is to be public, as a boolean", async () => {
    setupCalls.length = 0;
    expect((await get("/github/app/manifest?public=true")).status).toBe(200);
    expect((await get("/github/app/manifest?public=false")).status).toBe(200);
    expect(setupCalls).toEqual([
      { call: "manifest", arg: { public: true } },
      { call: "manifest", arg: { public: false } },
    ]);
  });

  test("answers what the setup refuses: not an owner is 403, already set up is 409", async () => {
    try {
      setupRefused = new ForbiddenError("Platform owners only");
      expect((await get("/github/app/manifest")).status).toBe(403);
      setupRefused = new ConflictError("GitHub is already set up");
      expect((await get("/github/app/callback?code=c&state=s")).status).toBe(409);
    } finally {
      setupRefused = null;
    }
  });

  test("keeps the app on the callback, then sends the person on to install it", async () => {
    setupCalls.length = 0;
    const response = await get("/github/app/callback?code=c0de&state=abc");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toStartWith(
      "https://github.com/apps/aven-test/installations/new?state=",
    );
    expect(setupCalls).toEqual([{ call: "complete", arg: { code: "c0de", state: "abc" } }]);
    expect((await get("/github/app/callback?state=abc")).status).toBe(422);
  });

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
    expect(readState(state, owner.organizationId, owner.userId)).toEqual({
      next: "/threads/abc",
      installationId: null,
    });
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
  test("sends an install GitHub reports without our state back through GitHub, to be confirmed", async () => {
    reset();
    const response = await get(
      "/github/callback?code=untrusted&installation_id=123&setup_action=install",
    );

    expect(response.status).toBe(302);
    const state = new URL(response.headers.get("location")!).searchParams.get("state")!;
    expect(readState(state, owner.organizationId, owner.userId)).toEqual({
      next: null,
      installationId: 123,
    });
    // The code of a link nobody signed is never used, and nothing is attached yet.
    expect(exchanged).toEqual([]);
    expect(kept).toEqual([]);
    expect(await (await get("/github/installations")).json()).toEqual([]);
  });

  test("has nothing to confirm in a callback with neither state nor installation", async () => {
    reset();
    expect((await get("/github/callback?code=good")).status).toBe(422);
    expect(exchanged).toEqual([]);
  });

  test("attaches the installation a confirmed state names, when GitHub says the person may use it", async () => {
    reset();
    const state = createState(owner.organizationId, owner.userId, Date.now(), undefined, 123);

    const response = await get(`/github/callback?code=good&state=${state}`);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/projects?github=connected");
    const installations = (await (await get("/github/installations")).json()) as {
      installationId: number;
      accountLogin: string;
    }[];
    expect(installations).toMatchObject([{ installationId: 123, accountLogin: "acme" }]);
    expect(kept).toEqual([{ userId: owner.userId, grant }]);
  });

  test("attaches nothing the person cannot use, even through a state of ours", async () => {
    reset();
    const state = createState(owner.organizationId, owner.userId, Date.now(), undefined, 999);

    expect((await get(`/github/callback?code=good&state=${state}`)).status).toBe(422);
    expect(await (await get("/github/installations")).json()).toMatchObject([
      { installationId: 123 },
    ]);
    expect(kept).toEqual([]);
  });
});
