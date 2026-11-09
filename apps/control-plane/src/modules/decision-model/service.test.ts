import { afterAll, describe, expect, test } from "bun:test";

import { UnprocessableError } from "../../errors";
import { decisionModelService } from "./service";

const run =
  process.env.DATABASE_URL && process.env.PROVIDER_ENCRYPTION_KEY ? describe : describe.skip;

run("decisionModelService (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { orgA, orgB, cleanup } = await seedOrgPair();

  afterAll(cleanup);

  test("a workspace has none until one is saved, and the key is never returned", async () => {
    expect(await decisionModelService.get(orgA)).toBeNull();
    expect(await decisionModelService.config(orgA)).toBeNull();
    const saved = await decisionModelService.save(orgA, {
      kind: "jev-openrouter",
      apiKey: "sk-or-v1-abcdef1234",
    });
    expect(saved).toEqual({
      kind: "jev-openrouter",
      modelId: "typesafe/jev-1.13",
      keyHint: "1234",
    });
    expect(await decisionModelService.config(orgA)).toEqual({
      kind: "jev-openrouter",
      modelId: "typesafe/jev-1.13",
      apiKey: "sk-or-v1-abcdef1234",
    });
  });

  test("a saved one is changed without entering its key again, and a first one needs a key", async () => {
    const changed = await decisionModelService.save(orgA, {
      kind: "jev-openrouter",
      modelId: "x/y",
    });
    expect(changed).toEqual({ kind: "jev-openrouter", modelId: "x/y", keyHint: "1234" });
    expect((await decisionModelService.config(orgA))?.apiKey).toBe("sk-or-v1-abcdef1234");
    await expect(decisionModelService.save(orgB, { kind: "jev" })).rejects.toBeInstanceOf(
      UnprocessableError,
    );
  });

  test("another workspace does not see it, and removing it leaves none", async () => {
    expect(await decisionModelService.get(orgB)).toBeNull();
    expect(await decisionModelService.remove(orgA)).toBe(true);
    expect(await decisionModelService.remove(orgA)).toBe(false);
    expect(await decisionModelService.get(orgA)).toBeNull();
  });
});
