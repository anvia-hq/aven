import { afterAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { db } from "@aven/db/client";

import { errorsRouter } from "@aven/server-kit/errors";
import { createMemoryStore } from "../../memory-store";
import { RuntimeHub } from "./hub";
import { runtimesRouter } from "./router";
import { LOCAL_RUNTIME_ID, runtimesService } from "./service";
import type { LatestRelease } from "./types";

const noReleases: LatestRelease = { get: async () => undefined };

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("changing a runner (real postgres)", async () => {
  const { joinOrganization, signUp } = await import("../../testing/sign-up");
  const server = new Elysia()
    .use(errorsRouter)
    .use(runtimesRouter(new RuntimeHub(createMemoryStore(db)), noReleases))
    .listen({ port: 0 });
  const base = `http://localhost:${server.server?.port}`;
  const owner = await signUp("owner");
  const admin = await signUp("admin");
  const member = await signUp("member");
  const outsider = await signUp("outsider");
  await joinOrganization(admin, owner.organizationId, "admin");
  await joinOrganization(member, owner.organizationId, "member");
  await runtimesService.ensureLocal();
  afterAll(async () => {
    await server.stop(true);
    for (const person of [owner, admin, member, outsider]) await person.remove();
  });

  const patch = (path: string, token: string | undefined, body: object) => {
    const headers: Record<string, string> = { "content-type": "application/json" };

    if (token) headers.authorization = `Bearer ${token}`;

    return fetch(`${base}/runtimes/${path}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });
  };
  const runnerOf = async (person: { userId: string }) =>
    (await runtimesService.create(owner.organizationId, person.userId, { name: "before" })).runtime
      .id;
  const stored = async (id: string) => (await runtimesService.get(owner.organizationId, id))!;
  const asPlatformOwner = async <T>(email: string, work: () => Promise<T>) => {
    const listed = process.env.PLATFORM_OWNER_EMAILS;
    process.env.PLATFORM_OWNER_EMAILS = email;
    try {
      return await work();
    } finally {
      if (listed === undefined) delete process.env.PLATFORM_OWNER_EMAILS;
      else process.env.PLATFORM_OWNER_EMAILS = listed;
    }
  };

  test("a runner is renamed by its owner, or by a workspace owner or admin, and by nobody else", async () => {
    const own = await runnerOf(member);
    const owners = await runnerOf(owner);

    expect((await patch(own, undefined, { name: "x" })).status).toBe(401);
    const refused = await patch(owners, member.token, { name: "taken" });
    expect(refused.status).toBe(403);
    expect(await refused.text()).toContain("Only the runner's owner, an owner or an admin");
    expect((await patch(owners, outsider.token, { name: "taken" })).status).toBe(404);
    expect((await stored(owners)).name).toBe("before");

    const renamed = await patch(own, member.token, { name: "  Laptop  " });
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toMatchObject({ id: own, name: "Laptop" });
    expect((await patch(own, admin.token, { name: "By admin" })).status).toBe(200);
    expect((await patch(own, owner.token, { name: "By owner" })).status).toBe(200);
    expect((await stored(own)).name).toBe("By owner");

    expect((await patch(own, owner.token, { name: "   " })).status).toBe(422);
    expect((await patch(crypto.randomUUID(), owner.token, { name: "ghost" })).status).toBe(404);
  });

  test("the built-in runner is renamed by a platform owner only", async () => {
    const { name } = await stored(LOCAL_RUNTIME_ID);
    const renamed = `renamed-${crypto.randomUUID().slice(0, 8)}`;
    try {
      const refused = await patch(LOCAL_RUNTIME_ID, admin.token, { name: "not yours" });
      expect(refused.status).toBe(403);
      expect(await refused.text()).toContain(
        "Only a platform owner can rename the built-in runner",
      );
      expect((await stored(LOCAL_RUNTIME_ID)).name).toBe(name);

      const allowed = await asPlatformOwner(admin.email, () =>
        patch(LOCAL_RUNTIME_ID, admin.token, { name: renamed }),
      );
      expect(allowed.status).toBe(200);
      expect((await stored(LOCAL_RUNTIME_ID)).name).toBe(renamed);
    } finally {
      await runtimesService.rename(owner.organizationId, LOCAL_RUNTIME_ID, name);
    }
  });

  test("which GitHub a runner uses is changed by its owner, or a workspace owner or admin, and by nobody else", async () => {
    const own = await runnerOf(member);
    const owners = await runnerOf(owner);
    const github = (id: string, token: string | undefined, githubMode: string) =>
      patch(`${id}/github`, token, { githubMode });

    expect((await github(own, undefined, "person")).status).toBe(401);
    const refused = await github(owners, member.token, "person");
    expect(refused.status).toBe(403);
    expect(await refused.text()).toContain("change which GitHub it uses");
    expect((await github(owners, outsider.token, "person")).status).toBe(404);
    expect((await stored(owners)).githubMode).toBe("machine");

    const changed = await github(own, member.token, "person");
    expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({ id: own, githubMode: "person" });
    expect((await github(own, admin.token, "machine")).status).toBe(200);
    expect((await github(own, owner.token, "person")).status).toBe(200);
    expect((await stored(own)).githubMode).toBe("person");

    expect((await github(own, owner.token, "anyone")).status).toBe(422);
  });

  test("which GitHub the built-in runner uses is changed by a platform owner only", async () => {
    const { githubMode } = await stored(LOCAL_RUNTIME_ID);
    const other = githubMode === "machine" ? "person" : "machine";
    try {
      const refused = await patch(`${LOCAL_RUNTIME_ID}/github`, admin.token, {
        githubMode: other,
      });
      expect(refused.status).toBe(403);
      expect((await stored(LOCAL_RUNTIME_ID)).githubMode).toBe(githubMode);

      const allowed = await asPlatformOwner(admin.email, () =>
        patch(`${LOCAL_RUNTIME_ID}/github`, admin.token, { githubMode: other }),
      );
      expect(allowed.status).toBe(200);
      expect((await stored(LOCAL_RUNTIME_ID)).githubMode).toBe(other);
    } finally {
      await runtimesService.setGithubMode(owner.organizationId, LOCAL_RUNTIME_ID, githubMode);
    }
  });
});
