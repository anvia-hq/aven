import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { users } from "@aven/db/schema/users";
import { encryptSecret } from "@aven/server-kit/crypto";
import { eq } from "drizzle-orm";

import { communityEdition } from "../../edition/community";
import { editionInUse } from "../../edition/current";
import type { GrantedProvider } from "../../edition/types";
import { botsService } from "../bots/service";
import { resolveModel } from "./resolve-model";
import { providersService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("edition-managed providers (postgres)", () => {
  const tag = crypto.randomUUID().slice(0, 8);
  const alice = `managed-alice-${tag}`;
  const managedId = crypto.randomUUID();
  const granted: GrantedProvider = {
    id: managedId,
    kind: "openai",
    name: "Aven Cloud OpenAI",
    baseUrl: null,
    modelId: "gpt-4.1-mini",
    allowedModels: ["gpt-4.1-mini"],
    apiKeyEncrypted: encryptSecret("sk-managed-test-key-1234"),
    keyHint: "1234",
    createdAt: new Date(),
  };

  beforeAll(async () => {
    await db.insert(users).values({
      id: alice,
      email: `${alice}@aven.test`,
      name: alice,
    });
    editionInUse.current = {
      ...communityEdition,
      providers: {
        list: async (userId) => (userId === alice ? [granted] : []),
        find: async (userId, id) => (userId === alice && id === managedId ? granted : null),
      },
    };
  });

  afterAll(async () => {
    editionInUse.current = communityEdition;
    await db.delete(users).where(eq(users.id, alice));
  });

  test("lists managed providers as read-only without exposing raw keys", async () => {
    const listed = await providersService.list(alice);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(managedId);
    expect(listed[0]?.managed).toBe(true);
    expect(listed[0]?.hasKey).toBe(true);
    expect(JSON.stringify(listed)).not.toContain("sk-managed-test-key");

    expect(await providersService.update(alice, managedId, { name: "hacked" })).toBeNull();
    expect(await providersService.remove(alice, managedId)).toBe(false);
  });

  test("resolves managed provider for runs and enforces allowedModels", async () => {
    const row = await providersService.forNativeRun(alice, managedId);
    expect(row?.id).toBe(managedId);
    expect(row?.allowedModels).toEqual(["gpt-4.1-mini"]);

    const fallback = await providersService.forNativeRun(alice, undefined);
    expect(fallback?.id).toBe(managedId);

    const allowed = await resolveModel(alice, { providerId: managedId, modelId: "gpt-4.1-mini" });
    expect(allowed?.provider).toBe("openai");
    expect(allowed?.modelId).toBe("gpt-4.1-mini");
    expect(allowed?.apiKey).toBe("sk-managed-test-key-1234");

    await expect(
      resolveModel(alice, { providerId: managedId, modelId: "gpt-4.1" }),
    ).rejects.toThrow("is not enabled");
  });

  test("allows bots to select a managed provider and clears it if revoked", async () => {
    const [main] = await botsService.list(alice);
    const updated = await botsService.update(alice, main!.id, {
      providerId: managedId,
      modelId: "gpt-4.1-mini",
    });
    expect(updated).toMatchObject({ providerId: managedId, modelId: "gpt-4.1-mini" });

    const previous = editionInUse.current;
    editionInUse.current = communityEdition;

    try {
      expect(await botsService.get(alice, main!.id)).toMatchObject({
        providerId: null,
        modelId: null,
      });
    } finally {
      editionInUse.current = previous;
    }
  });
});
