import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { Elysia } from "elysia";

import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { organizations } from "@aven/db/schema/organizations";
import { sessions } from "@aven/db/schema/sessions";
import { and, eq } from "drizzle-orm";

import { signUp } from "../../testing/sign-up";
import { authRouter } from "./router";
import { authService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("the auth macros (real postgres)", async () => {
  const app = new Elysia()
    .use(authRouter)
    .get("/whoami", ({ organizationId }) => ({ organizationId }), { org: true })
    .get("/both", ({ user, organizationId }) => ({ userId: user.id, organizationId }), {
      auth: true,
      org: true,
    });
  const owner = await signUp("owner");
  const other = await signUp("other");
  const shared = `org-${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(organizations).values({ id: shared, name: shared, slug: shared });
  await db.insert(members).values({
    id: crypto.randomUUID(),
    organizationId: shared,
    userId: other.userId,
    role: "member",
  });
  await db
    .update(sessions)
    .set({ activeOrganizationId: shared })
    .where(eq(sessions.userId, other.userId));

  const call = (token: string) =>
    app.handle(
      new Request("http://localhost/whoami", { headers: { authorization: `Bearer ${token}` } }),
    );
  const requestTo = (path: string, token: string) =>
    new Request(`http://localhost${path}`, { headers: { authorization: `Bearer ${token}` } });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, shared));
    await owner.remove();
    await other.remove();
  });

  test("a member's active organization is accepted", async () => {
    const response = await call(other.token);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ organizationId: shared });
  });

  test("an organization the person was removed from is refused on an existing session", async () => {
    await db
      .delete(members)
      .where(and(eq(members.organizationId, shared), eq(members.userId, other.userId)));
    const response = await call(other.token);
    expect(response.status).toBe(400);
  });

  test("two macros of one request share a single session lookup", async () => {
    const lookUp = authService.getSession;
    const lookups = spyOn(authService, "getSession").mockImplementation(async (headers) =>
      lookUp(headers),
    );
    try {
      const response = await app.handle(requestTo("/both", owner.token));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        userId: owner.userId,
        organizationId: owner.organizationId,
      });
      expect(lookups).toHaveBeenCalledTimes(1);
    } finally {
      lookups.mockRestore();
    }
  });

  test("a session lookup that rejects is looked up again instead of being replayed", async () => {
    const lookUp = authService.getSession;
    let answers = 0;
    const lookups = spyOn(authService, "getSession").mockImplementation(async (headers) => {
      answers += 1;
      if (answers === 1) throw new Error("the session lookup failed");
      return lookUp(headers);
    });
    const request = requestTo("/both", owner.token);
    try {
      expect((await app.handle(request)).status).toBe(500);
      const answered = await app.handle(request);
      expect(answered.status).toBe(200);
      expect(await answered.json()).toEqual({
        userId: owner.userId,
        organizationId: owner.organizationId,
      });
      expect(lookups).toHaveBeenCalledTimes(2);
    } finally {
      lookups.mockRestore();
    }
  });
});
