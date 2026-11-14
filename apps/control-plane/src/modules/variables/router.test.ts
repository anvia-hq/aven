import { afterAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { db } from "@aven/db/client";
import { members } from "@aven/db/schema/members";
import { and, eq } from "drizzle-orm";

import { errorsRouter } from "@aven/server-kit/errors";
import { variablesRouter } from "./router";

const run =
  process.env.DATABASE_URL && process.env.PROVIDER_ENCRYPTION_KEY ? describe : describe.skip;

run("the variables routes (real postgres)", async () => {
  const { joinOrganization, signUp } = await import("../../testing/sign-up");
  const server = new Elysia().use(errorsRouter).use(variablesRouter).listen({ port: 0 });
  const base = `http://localhost:${server.server?.port}`;
  const owner = await signUp("owner");
  const member = await signUp("member");
  const outsider = await signUp("outsider");
  await joinOrganization(member, owner.organizationId, "member");
  afterAll(async () => {
    await server.stop(true);
    for (const person of [owner, member, outsider]) await person.remove();
  });

  const call = (method: string, path: string, token: string | undefined, body?: object) => {
    const headers: Record<string, string> = { "content-type": "application/json" };

    if (token) headers.authorization = `Bearer ${token}`;

    return fetch(`${base}/variables${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  };
  const names = async (path: string, token: string) =>
    ((await (await call("GET", path, token)).json()) as { name: string }[]).map(({ name }) => name);

  test("need a session", async () => {
    for (const scope of ["workspace", "personal"]) {
      expect((await call("GET", `/${scope}`, undefined)).status).toBe(401);
      expect((await call("GET", `/${scope}/history`, undefined)).status).toBe(401);
      expect((await call("PUT", `/${scope}/REGION`, undefined, { value: "eu" })).status).toBe(401);
      expect((await call("DELETE", `/${scope}/REGION`, undefined)).status).toBe(401);
    }
  });

  test("set, list and remove a variable in each scope, and never return a secret", async () => {
    for (const scope of ["workspace", "personal"]) {
      const saved = await call("PUT", `/${scope}/REGION`, owner.token, { value: "eu" });
      expect(saved.status).toBe(200);
      expect(await saved.json()).toMatchObject({ name: "REGION", value: "eu", secret: false });
      const secret = await call("PUT", `/${scope}/TOKEN`, owner.token, {
        value: "sk-route-secret-9876",
        secret: true,
      });
      expect(await secret.json()).toMatchObject({ value: null, valueHint: "9876" });

      const listed = await call("GET", `/${scope}`, owner.token);
      expect(listed.status).toBe(200);
      const text = await listed.text();
      expect(text).toContain("REGION");
      expect(text).not.toContain("sk-route-secret");

      const history = await call("GET", `/${scope}/history`, owner.token);
      expect(history.status).toBe(200);
      expect(await history.text()).not.toContain("sk-route-secret");

      expect((await call("DELETE", `/${scope}/REGION`, owner.token)).status).toBe(204);
      expect((await call("DELETE", `/${scope}/REGION`, owner.token)).status).toBe(404);
      expect(await names(`/${scope}`, owner.token)).toEqual(["TOKEN"]);
    }
  });

  test("refuse a name that is not one, a reserved name and a secret without a value", async () => {
    for (const scope of ["workspace", "personal"]) {
      const refused = async (name: string, body: object) =>
        (await call("PUT", `/${scope}/${name}`, owner.token, body)).status;
      expect(await refused("1ST", { value: "x" })).toBe(422);
      expect(await refused("GIT_DIR", { value: "x" })).toBe(422);
      expect(await refused("EMPTY", { value: "", secret: true })).toBe(422);
      expect(await refused("BAD", {})).toBe(422);
      expect((await call("DELETE", `/${scope}/PATH`, owner.token)).status).toBe(422);
    }
  });

  test("a member reads the workspace's variables but cannot change them, and keeps their own apart", async () => {
    await call("PUT", "/workspace/SHARED", owner.token, { value: "1" });
    await call("PUT", "/personal/OWNERS_OWN", owner.token, { value: "1" });

    expect(await names("/workspace", member.token)).toContain("SHARED");
    expect((await call("PUT", "/workspace/SHARED", member.token, { value: "2" })).status).toBe(403);
    expect((await call("DELETE", "/workspace/SHARED", member.token)).status).toBe(403);
    expect((await call("PUT", "/workspace/NEW", member.token, { value: "2" })).status).toBe(403);
    expect(await names("/workspace", owner.token)).not.toContain("NEW");

    expect((await call("PUT", "/personal/MEMBERS_OWN", member.token, { value: "m" })).status).toBe(
      200,
    );
    expect(await names("/personal", member.token)).toEqual(["MEMBERS_OWN"]);
    expect(await names("/personal", owner.token)).not.toContain("MEMBERS_OWN");
    expect((await call("DELETE", "/personal/OWNERS_OWN", member.token)).status).toBe(404);
  });

  test("another organization sees and changes none of the workspace's variables", async () => {
    await call("PUT", "/workspace/PRIVATE", owner.token, { value: "1" });

    expect(await names("/workspace", outsider.token)).not.toContain("PRIVATE");
    expect((await call("DELETE", "/workspace/PRIVATE", outsider.token)).status).toBe(404);
    expect(await names("/workspace", owner.token)).toContain("PRIVATE");
  });

  test("a person who left the workspace is refused, not shown it", async () => {
    const leaver = await signUp("leaver");
    try {
      await joinOrganization(leaver, owner.organizationId, "admin");
      expect((await call("GET", "/workspace", leaver.token)).status).toBe(200);

      await db
        .delete(members)
        .where(
          and(eq(members.organizationId, owner.organizationId), eq(members.userId, leaver.userId)),
        );

      expect((await call("GET", "/workspace", leaver.token)).status).toBe(400);
      expect((await call("PUT", "/workspace/LEFT", leaver.token, { value: "x" })).status).toBe(400);
      expect(await names("/workspace", owner.token)).not.toContain("LEFT");
    } finally {
      await leaver.remove();
    }
  });
});
