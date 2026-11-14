import { afterAll, describe, expect, test } from "bun:test";

import { seedOrgPair } from "../../testing/seed-org-pair";
import { LOCAL_RUNTIME_ID, runtimesService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("runtimes service (real postgres)", async () => {
  const seed = await seedOrgPair();
  afterAll(() => seed.cleanup());

  test("the token authenticates once created and is never listed", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, {
      name: "laptop",
    });
    expect((await runtimesService.authenticate(token))?.id).toBe(runtime.id);
    expect(await runtimesService.authenticate(`${token}x`)).toBeNull();
    expect(await runtimesService.authenticate("nope")).toBeNull();

    const listed = await runtimesService.list(seed.orgA, seed.userId);
    expect(JSON.stringify(listed)).not.toContain(token);
    expect(listed[0]).not.toHaveProperty("tokenHash");
    expect(runtime.tokenHint).toBe(token.slice(-4));
  });

  test("another organization does not see it", async () => {
    const { runtime } = await runtimesService.create(seed.orgA, seed.userId, { name: "a-only" });
    expect(await runtimesService.get(seed.orgB, runtime.id)).toBeNull();
    expect((await runtimesService.list(seed.orgB, seed.userId)).map((r) => r.id)).not.toContain(
      runtime.id,
    );
  });

  test("only the owner can revoke, and a revoked token stops working", async () => {
    const { runtime, token } = await runtimesService.create(seed.orgA, seed.userId, {
      name: "revoke-me",
    });
    expect(await runtimesService.revoke(seed.orgA, "someone-else", runtime.id)).toBeNull();
    expect(await runtimesService.authenticate(token)).not.toBeNull();

    expect(await runtimesService.revoke(seed.orgA, seed.userId, runtime.id)).not.toBeNull();
    expect(await runtimesService.authenticate(token)).toBeNull();
    expect(await runtimesService.get(seed.orgA, runtime.id)).toBeNull();
  });

  test("a runner found by its token is no longer current once it is revoked or rotated", async () => {
    const revoked = await runtimesService.create(seed.orgA, seed.userId, { name: "r1" });
    const rotated = await runtimesService.create(seed.orgA, seed.userId, { name: "r2" });
    const revokedRow = (await runtimesService.authenticate(revoked.token))!;
    const rotatedRow = (await runtimesService.authenticate(rotated.token))!;
    expect(await runtimesService.stillCurrent(revokedRow)).toBe(true);
    expect(await runtimesService.stillCurrent(rotatedRow)).toBe(true);

    await runtimesService.revoke(seed.orgA, seed.userId, revoked.runtime.id);
    await runtimesService.rotate(seed.orgA, seed.userId, rotated.runtime.id);
    expect(await runtimesService.stillCurrent(revokedRow)).toBe(false);
    expect(await runtimesService.stillCurrent(rotatedRow)).toBe(false);
  });

  test("the control plane's own runner is visible to every organization and cannot be revoked or rotated", async () => {
    await runtimesService.ensureLocal();
    const original = (await runtimesService.get(seed.orgA, LOCAL_RUNTIME_ID))!;
    const renamed = `renamed-${crypto.randomUUID()}`;
    await runtimesService.rename(seed.orgA, LOCAL_RUNTIME_ID, renamed);
    try {
      await runtimesService.ensureLocal();

      for (const org of [seed.orgA, seed.orgB]) {
        const listed = await runtimesService.list(org, seed.userId);
        expect(listed.map((runtime) => runtime.id)).toContain(LOCAL_RUNTIME_ID);
        expect((await runtimesService.get(org, LOCAL_RUNTIME_ID))?.name).toBe(renamed);
      }
    } finally {
      await runtimesService.rename(seed.orgA, LOCAL_RUNTIME_ID, original.name);
    }
    expect(await runtimesService.revoke(seed.orgA, seed.userId, LOCAL_RUNTIME_ID)).toBeNull();
    expect(await runtimesService.rotate(seed.orgA, seed.userId, LOCAL_RUNTIME_ID)).toBeNull();

    expect((await runtimesService.authenticate(runtimesService.localToken))?.id).toBe(
      LOCAL_RUNTIME_ID,
    );
    expect(await runtimesService.authenticate("avrt_local_guess")).toBeNull();
  });

  test("a runner that works on its own machine is its owner's alone", async () => {
    const { runtime } = await runtimesService.create(seed.orgA, seed.userId, { name: "my mac" });
    await runtimesService.setHost(runtime.id, true);

    expect((await runtimesService.get(seed.orgA, runtime.id, seed.userId))?.id).toBe(runtime.id);
    expect(await runtimesService.get(seed.orgA, runtime.id, "a-teammate")).toBeNull();
    expect((await runtimesService.list(seed.orgA, "a-teammate")).map((r) => r.id)).not.toContain(
      runtime.id,
    );
  });

  test("the control plane's own runner has no owner, so it is the workspace's", async () => {
    await runtimesService.ensureLocal();
    const { host } = (await runtimesService.get(seed.orgA, LOCAL_RUNTIME_ID))!;
    await runtimesService.setHost(LOCAL_RUNTIME_ID, true);
    try {
      expect((await runtimesService.get(seed.orgA, LOCAL_RUNTIME_ID, "a-teammate"))?.id).toBe(
        LOCAL_RUNTIME_ID,
      );
    } finally {
      await runtimesService.setHost(LOCAL_RUNTIME_ID, host);
    }
  });

  test("a runner in a container is the workspace's", async () => {
    const { runtime } = await runtimesService.create(seed.orgA, seed.userId, { name: "docker" });

    expect((await runtimesService.get(seed.orgA, runtime.id, "a-teammate"))?.id).toBe(runtime.id);
  });

  test("a runtime is renamed in its own organization only, and a revoked one is not found", async () => {
    const { runtime } = await runtimesService.create(seed.orgA, seed.userId, { name: "old name" });

    expect(await runtimesService.rename(seed.orgB, runtime.id, "stolen")).toBeNull();
    expect((await runtimesService.get(seed.orgA, runtime.id))?.name).toBe("old name");

    expect((await runtimesService.rename(seed.orgA, runtime.id, "Homelab"))?.name).toBe("Homelab");
    expect((await runtimesService.get(seed.orgA, runtime.id))?.name).toBe("Homelab");
    expect(
      (
        await runtimesService.authenticate(
          (await runtimesService.rotate(seed.orgA, seed.userId, runtime.id))!.token,
        )
      )?.name,
    ).toBe("Homelab");

    await runtimesService.revoke(seed.orgA, seed.userId, runtime.id);
    expect(await runtimesService.rename(seed.orgA, runtime.id, "again")).toBeNull();
  });

  const encryptionReady =
    Buffer.from(process.env.PROVIDER_ENCRYPTION_KEY ?? "", "base64").length === 32;

  test.skipIf(!encryptionReady)(
    "a boat runtime keeps its key encrypted and checks it with boat",
    async () => {
      const apiKey = "boat_unit_test_key_zzzz";
      const seen: { url: string; authorization: string }[] = [];
      const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        seen.push({ url: String(input), authorization: headers.get("authorization") ?? "" });
        return Response.json({ ok: true, type: "user.info", user: { login: "octocat" } });
      }) as typeof fetch;

      const { runtime, token } = await runtimesService.create(
        seed.orgA,
        seed.userId,
        { name: "boat-cloud", provider: "boat", apiKey, machineType: "small" },
        fetchFn,
      );

      expect(seen).toEqual([
        { url: "https://boat.dev/api/v1/me", authorization: `Bearer ${apiKey}` },
      ]);
      expect(runtime.provider).toBe("boat");
      expect(runtime.githubMode).toBe("person");
      expect(runtime.boatMachineType).toBe("small");
      expect(runtime.boatKeyHint).toBe("zzzz");
      expect(runtime.boatSandboxId).toBeNull();

      const listed = JSON.stringify(await runtimesService.list(seed.orgA, seed.userId));
      expect(listed).not.toContain(apiKey);
      expect(listed).not.toContain(token);
      expect(listed).not.toContain("boatApiKeyEncrypted");
      expect(listed).not.toContain("boatRunnerTokenEncrypted");

      expect(await runtimesService.boatRecord(runtime.id)).toMatchObject({
        apiKey,
        runnerToken: token,
        machineType: "small",
        sandboxId: null,
      });

      const rotated = await runtimesService.rotate(seed.orgA, seed.userId, runtime.id);
      expect(typeof rotated?.token).toBe("string");
      expect((await runtimesService.boatRecord(runtime.id))?.runnerToken).toBe(rotated?.token);
      expect(await runtimesService.authenticate(token)).toBeNull();
      expect((await runtimesService.authenticate(rotated!.token))?.id).toBe(runtime.id);

      const rejected = (async () =>
        Response.json(
          { ok: false, code: "unauthorized", message: "Unauthorized" },
          { status: 401 },
        )) as unknown as typeof fetch;
      await expect(
        runtimesService.create(
          seed.orgA,
          seed.userId,
          { name: "boat-bad", provider: "boat", apiKey: "boat_rejected_key_xxxx" },
          rejected,
        ),
      ).rejects.toThrow("Boat rejected this API key");
      expect(
        (await runtimesService.list(seed.orgA, seed.userId)).some((row) => row.name === "boat-bad"),
      ).toBe(false);
    },
  );
});
