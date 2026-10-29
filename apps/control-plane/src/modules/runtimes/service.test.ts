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

    const listed = await runtimesService.list(seed.orgA);
    expect(JSON.stringify(listed)).not.toContain(token);
    expect(listed[0]).not.toHaveProperty("tokenHash");
    expect(runtime.tokenHint).toBe(token.slice(-4));
  });

  test("another organization does not see it", async () => {
    const { runtime } = await runtimesService.create(seed.orgA, seed.userId, { name: "a-only" });
    expect(await runtimesService.get(seed.orgB, runtime.id)).toBeNull();
    expect((await runtimesService.list(seed.orgB)).map((r) => r.id)).not.toContain(runtime.id);
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

  test("the control plane's own runner is visible to every organization and cannot be changed", async () => {
    await runtimesService.ensureLocal();
    await runtimesService.ensureLocal(); // idempotent

    for (const org of [seed.orgA, seed.orgB]) {
      const listed = await runtimesService.list(org);
      expect(listed.map((runtime) => runtime.id)).toContain(LOCAL_RUNTIME_ID);
      expect((await runtimesService.get(org, LOCAL_RUNTIME_ID))?.name).toBe("Control plane");
    }
    // Nobody owns it, so nobody can revoke or rotate it.
    expect(await runtimesService.revoke(seed.orgA, seed.userId, LOCAL_RUNTIME_ID)).toBeNull();
    expect(await runtimesService.rotate(seed.orgA, seed.userId, LOCAL_RUNTIME_ID)).toBeNull();

    // It connects with a token only this process knows; no other token reaches it.
    expect((await runtimesService.authenticate(runtimesService.localToken))?.id).toBe(
      LOCAL_RUNTIME_ID,
    );
    expect(await runtimesService.authenticate("avrt_local_guess")).toBeNull();
  });
});
