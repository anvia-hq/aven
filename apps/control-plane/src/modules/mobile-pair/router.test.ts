import { createHash } from "node:crypto";

import { afterAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { db } from "@aven/db/client";
import { sessions } from "@aven/db/schema/sessions";
import { verifications } from "@aven/db/schema/verifications";
import { eq } from "drizzle-orm";

import { signUp } from "../../testing/sign-up";
import { authRouter } from "../auth/router";
import { mobilePairRouter } from "./router";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("mobile pairing (real postgres)", async () => {
  const app = new Elysia()
    .use(authRouter)
    .use(mobilePairRouter)
    .get("/whoami", ({ user, organizationId }) => ({ userId: user.id, organizationId }), {
      auth: true,
      org: true,
    });
  const owner = await signUp("mobile-pair");

  afterAll(async () => {
    await owner.remove();
  });

  const createCode = (token?: string) =>
    app.handle(
      new Request("http://localhost/mobile-pair", {
        method: "POST",
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    );

  const exchange = (code: string) =>
    app.handle(
      new Request("http://localhost/mobile-pair/exchange", {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "AvenMobile/0.1" },
        body: JSON.stringify({ code }),
      }),
    );

  test("unauthenticated callers cannot generate a pairing code", async () => {
    const response = await createCode();
    expect(response.status).toBe(401);
  });

  test("a pairing code exchanges once for an independent bearer session", async () => {
    const created = await createCode(owner.token);
    expect(created.status).toBe(201);
    const { code, expiresAt } = (await created.json()) as { code: string; expiresAt: string };
    expect(code.length).toBeGreaterThanOrEqual(32);
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now());

    const first = await exchange(code);
    expect(first.status).toBe(200);
    const headerToken = first.headers.get("set-auth-token");
    const body = (await first.json()) as { token: string; expiresAt: string };
    expect(headerToken).toBe(body.token);
    expect(body.token).not.toBe(owner.token);

    const whoami = await app.handle(
      new Request("http://localhost/whoami", {
        headers: { authorization: `Bearer ${body.token}` },
      }),
    );
    expect(whoami.status).toBe(200);
    expect(await whoami.json()).toEqual({
      userId: owner.userId,
      organizationId: owner.organizationId,
    });

    const replay = await exchange(code);
    expect(replay.status).toBe(401);

    await db.delete(sessions).where(eq(sessions.token, body.token));
  });

  test("concurrent exchanges of the same pairing code succeed only once", async () => {
    const created = await createCode(owner.token);
    const { code } = (await created.json()) as { code: string };

    const [a, b] = await Promise.all([exchange(code), exchange(code)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 401]);

    const winner = a.status === 200 ? a : b;
    const { token } = (await winner.json()) as { token: string };
    await db.delete(sessions).where(eq(sessions.token, token));
  });

  test("an expired pairing code is rejected", async () => {
    const created = await createCode(owner.token);
    const { code } = (await created.json()) as { code: string };
    const hash = createHash("sha256").update(code).digest("hex");
    const identifier = `mobile-pair:${hash}`;

    await db
      .update(verifications)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(verifications.identifier, identifier));

    const response = await exchange(code);
    expect(response.status).toBe(401);

    await db.delete(verifications).where(eq(verifications.identifier, identifier));
  });
});
