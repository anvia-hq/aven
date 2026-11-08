import { afterAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { organizations } from "@aven/db/schema/organizations";
import { sessions } from "@aven/db/schema/sessions";
import { and, eq } from "drizzle-orm";

import { signUp } from "../../testing/sign-up";
import { authRouter } from "./router";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("the org macro (real postgres)", async () => {
  const app = new Elysia()
    .use(authRouter)
    .get("/whoami", ({ organizationId }) => ({ organizationId }), { org: true });
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
});
