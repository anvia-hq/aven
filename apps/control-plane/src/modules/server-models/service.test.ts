import { beforeAll, describe, expect, test } from "bun:test";

import {
  ConflictError,
  NotFoundError,
  UnavailableError,
  UnprocessableError,
} from "@aven/server-kit/errors";
import { keepPlatformSettings } from "../../testing/kept-platform-settings";
import { serverModelsService } from "./service";

const run =
  process.env.DATABASE_URL && process.env.PROVIDER_ENCRYPTION_KEY ? describe : describe.skip;

run("serverModelsService (postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const { platformSettings } = await import("@aven/db/schema/platform-settings");
  const { eq, inArray } = await import("drizzle-orm");

  const clear = () =>
    db
      .delete(platformSettings)
      .where(inArray(platformSettings.key, ["server_decision_model", "server_small_model"]));

  keepPlatformSettings(["server_decision_model", "server_small_model"]);
  beforeAll(clear);

  const accepted = async () => undefined;

  test("nothing is set until an owner saves one, and the key is never returned", async () => {
    expect(await serverModelsService.view({})).toEqual({ decision: null, small: null });
    expect(await serverModelsService.decision({})).toBeNull();

    const saved = await serverModelsService.saveDecision(
      { kind: "jev-openrouter", apiKey: "sk-or-v1-abcdef1234" },
      {},
    );
    expect(saved).toEqual({
      kind: "jev-openrouter",
      modelId: "typesafe/jev-1.13",
      keyHint: "1234",
      source: "platform",
    });
    expect(await serverModelsService.decision({})).toEqual({
      kind: "jev-openrouter",
      modelId: "typesafe/jev-1.13",
      apiKey: "sk-or-v1-abcdef1234",
    });
  });

  test("saving without a key keeps the saved one, and a first save needs a key", async () => {
    await serverModelsService.saveDecision({ kind: "jev", modelId: "jev-latest" }, {});
    expect((await serverModelsService.decision({}))?.apiKey).toBe("sk-or-v1-abcdef1234");
    await serverModelsService.removeDecision({});
    await expect(
      serverModelsService.saveDecision({ kind: "jev", modelId: "jev-latest" }, {}),
    ).rejects.toBeInstanceOf(UnprocessableError);
    await expect(serverModelsService.removeDecision({})).rejects.toBeInstanceOf(NotFoundError);
  });

  test("a small model is saved with its provider and model, and returned without its key", async () => {
    const saved = await serverModelsService.saveSmall(
      { kind: "anthropic", modelId: "claude-haiku-5-5", apiKey: "sk-ant-zzzz9876" },
      {},
      accepted,
    );
    expect(saved).toEqual({
      kind: "anthropic",
      modelId: "claude-haiku-5-5",
      keyHint: "9876",
      source: "platform",
    });
    expect(await serverModelsService.small({})).toEqual({
      provider: "anthropic",
      modelId: "claude-haiku-5-5",
      apiKey: "sk-ant-zzzz9876",
    });
  });

  test("the environment wins over what is saved, and refuses changes here", async () => {
    const env = {
      DECISION_MODEL_API_KEY: "sk-or-v1-fromenv0000",
      SMALL_MODEL_API_KEY: "sk-env",
      SMALL_MODEL_ID: "small-1",
    };
    expect((await serverModelsService.small(env))?.apiKey).toBe("sk-env");
    expect((await serverModelsService.view(env)).small?.source).toBe("env");
    expect((await serverModelsService.view(env)).decision?.keyHint).toBe("");
    await expect(
      serverModelsService.saveSmall({ kind: "openai", modelId: "m" }, env, accepted),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(serverModelsService.removeDecision(env)).rejects.toBeInstanceOf(ConflictError);
    await serverModelsService.removeSmall({});
  });

  test("a small model the provider refuses is not saved", async () => {
    const refused = async () => {
      throw new UnprocessableError("The provider did not accept this key and model");
    };
    await expect(
      serverModelsService.saveSmall(
        { kind: "anthropic", modelId: "claude-haiku-5-5", apiKey: "sk-ant-bad0000" },
        {},
        refused,
      ),
    ).rejects.toBeInstanceOf(UnprocessableError);
    expect((await serverModelsService.view({})).small).toBeNull();
  });

  test("the key saved before is the one checked when only the model changes", async () => {
    await serverModelsService.saveSmall(
      { kind: "anthropic", modelId: "claude-haiku-5-5", apiKey: "sk-ant-first1111" },
      {},
      accepted,
    );
    const seen: (string | undefined)[] = [];
    await serverModelsService.saveSmall(
      { kind: "anthropic", modelId: "claude-haiku-4" },
      {},
      async (config) => {
        seen.push(config.apiKey);
      },
    );
    expect(seen).toEqual(["sk-ant-first1111"]);
    await serverModelsService.removeSmall({});
  });

  test("a saved key that cannot be read does not stop the view, only the use of the key", async () => {
    await serverModelsService.saveSmall(
      { kind: "anthropic", modelId: "claude-haiku-5-5", apiKey: "sk-ant-zzzz9876" },
      {},
      accepted,
    );
    await db
      .update(platformSettings)
      .set({
        value: JSON.stringify({
          kind: "anthropic",
          modelId: "claude-haiku-5-5",
          apiKeyEncrypted: "broken",
          keyHint: "9876",
        }),
      })
      .where(eq(platformSettings.key, "server_small_model"));
    expect((await serverModelsService.view({})).small?.modelId).toBe("claude-haiku-5-5");
    const refused = serverModelsService.small({});
    await expect(refused).rejects.toBeInstanceOf(UnavailableError);
    await expect(refused).rejects.toThrow("enter it again");
    await serverModelsService.removeSmall({});
  });
});
