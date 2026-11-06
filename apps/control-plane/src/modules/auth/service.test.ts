import { afterAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { db } from "@aven/db/client";
import { users } from "@aven/db/schema/users";
import { eq } from "drizzle-orm";

import { projectsRouter } from "../projects/router";
import { auth } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

// A native client (the macOS app) has no cookie jar: it signs in once, keeps the token the
// response hands back and presents it as a bearer token (decision 0008).
run("bearer sessions for native clients (real postgres)", () => {
  const email = `native-${crypto.randomUUID().slice(0, 8)}@aven.test`;
  const app = new Elysia().use(projectsRouter(() => {}));

  afterAll(async () => {
    await db.delete(users).where(eq(users.email, email));
  });

  const call = (path: string, init?: RequestInit) =>
    app.handle(new Request(`http://localhost${path}`, init));

  test("sign in returns a token that authenticates API calls", async () => {
    const base = process.env.BETTER_AUTH_URL ?? "http://localhost:5173";
    const signUp = await auth.handler(
      new Request(`${base}/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Native", email, password: "password123" }),
      }),
    );
    expect(signUp.status).toBe(200);

    const signIn = await auth.handler(
      new Request(`${base}/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: "password123" }),
      }),
    );
    const token = signIn.headers.get("set-auth-token");
    expect(token).toBeTruthy();

    // A session starts in the user's personal organization, so org-scoped routes work.
    const authed = await call("/projects", { headers: { authorization: `Bearer ${token}` } });
    expect(authed.status).toBe(200);
    expect(await authed.json()).toEqual([]);

    expect((await call("/projects")).status).toBe(401);
    expect(
      (await call("/projects", { headers: { authorization: "Bearer not-a-token" } })).status,
    ).toBe(401);
  });
});
