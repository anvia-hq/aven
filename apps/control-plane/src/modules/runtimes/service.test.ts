import { afterAll, describe, expect, test } from "bun:test";

import { seedOrgPair } from "../../test-support";
import { runtimesService } from "./service";

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
});
