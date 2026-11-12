import { afterAll, describe, expect, test } from "bun:test";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("acting as a person (real postgres)", async () => {
  const { Elysia } = await import("elysia");
  const { db } = await import("@aven/db/client");
  const { users } = await import("@aven/db/schema/users");
  const { eq } = await import("drizzle-orm");
  const { authRouter } = await import("../auth/router");
  const { ACTING_HEADER, grantActing } = await import("../auth/acting");

  const userId = `u-act-${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(users).values({ id: userId, name: "Acting", email: `${userId}@aven.test` });
  afterAll(() => db.delete(users).where(eq(users.id, userId)));

  const app = new Elysia()
    .use(authRouter)
    .get("/me", ({ user }) => user.id, { auth: true })
    .get("/org", ({ organizationId }) => organizationId, { org: true, auth: true });

  const ask = (path: string, token?: string) =>
    app.handle(
      new Request(
        `http://aven.internal${path}`,
        token ? { headers: { [ACTING_HEADER]: token } } : {},
      ),
    );

  test("a grant signs a request in as that person, and ends when revoked", async () => {
    expect((await ask("/me")).status).toBe(401);
    const grant = grantActing(userId, null);
    const signedIn = await ask("/me", grant.token);
    expect(signedIn.status).toBe(200);
    expect(await signedIn.text()).toBe(userId);
    grant.revoke();
    expect((await ask("/me", grant.token)).status).toBe(401);
  });

  test("a made-up token is nobody", async () => {
    expect((await ask("/me", "not-a-grant")).status).toBe(401);
  });

  test("a workspace the person is not a member of is refused", async () => {
    const grant = grantActing(userId, "org-that-is-not-theirs");
    expect((await ask("/org", grant.token)).status).toBe(400);
    grant.revoke();
  });
});
