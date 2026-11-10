import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { LOCAL_RUNTIME_ID, runtimesService } from "../runtimes/service";
import { assertOwnRunner, OTHER_PROVIDER } from "./codex-runner";
import { InvalidSelectionError, resolveModel } from "./resolve-model";
import { providersService } from "./service";
import type { ModelConfig } from "@aven/agents/types";

const codex: ModelConfig = { provider: "codex", modelId: "gpt-5" };
const anthropic: ModelConfig = { provider: "anthropic" };

const runnerOf = (ownerId: string | null) =>
  spyOn(runtimesService, "get").mockResolvedValue({ id: "rt-1", ownerId } as never);

afterEach(() => {
  delete process.env.AVEN_BUILTIN_RUNNER_OWNER;
});

describe("a Codex provider runs only on the sender's own runner", () => {
  test("a runner owned by the sender is allowed", async () => {
    const get = runnerOf("ada");
    await assertOwnRunner("org-1", "rt-1", codex, "ada");
    get.mockRestore();
  });

  test("another member's runner is refused, with what to do instead", async () => {
    const get = runnerOf("grace");
    await expect(assertOwnRunner("org-1", "rt-1", codex, "ada")).rejects.toThrow(OTHER_PROVIDER);
    get.mockRestore();
  });

  test("a runner with no owner, or one that is not there, is refused", async () => {
    const none = runnerOf(null);
    await expect(assertOwnRunner("org-1", "rt-1", codex, "ada")).rejects.toThrow(OTHER_PROVIDER);
    none.mockRestore();
    const gone = spyOn(runtimesService, "get").mockResolvedValue(null);
    await expect(assertOwnRunner("org-1", "rt-1", codex, "ada")).rejects.toBeInstanceOf(
      InvalidSelectionError,
    );
    gone.mockRestore();
  });

  test("the built-in runner has no owner unless the operator names one", async () => {
    const get = runnerOf(null);
    await expect(assertOwnRunner("org-1", LOCAL_RUNTIME_ID, codex, "ada")).rejects.toThrow(
      OTHER_PROVIDER,
    );
    process.env.AVEN_BUILTIN_RUNNER_OWNER = "ada";
    await assertOwnRunner("org-1", LOCAL_RUNTIME_ID, codex, "ada");
    await expect(assertOwnRunner("org-1", LOCAL_RUNTIME_ID, codex, "grace")).rejects.toThrow(
      OTHER_PROVIDER,
    );
    get.mockRestore();
  });

  test("a provider with an API key is not asked about the runner at all", async () => {
    const get = spyOn(runtimesService, "get");
    await assertOwnRunner("org-1", "rt-1", anthropic, "ada");
    await assertOwnRunner("org-1", "rt-1", null, "ada");
    expect(get).not.toHaveBeenCalled();
    get.mockRestore();
  });
});

describe("resolving a Codex provider", () => {
  const row = { kind: "codex", name: "Codex", modelId: "gpt-5", apiKeyEncrypted: null };

  test("names the model and effort and needs no key, no catalog and no base URL", async () => {
    const forRun = spyOn(providersService, "forRun").mockResolvedValue(row as never);
    expect(await resolveModel("ada", { reasoningEffort: "high" })).toEqual({
      provider: "codex",
      modelId: "gpt-5",
      reasoningEffort: "high",
    });
    expect(await resolveModel("ada", { modelId: "gpt-5-codex" })).toMatchObject({
      modelId: "gpt-5-codex",
    });
    forRun.mockRestore();
  });

  test("an effort Codex does not have is refused", async () => {
    const forRun = spyOn(providersService, "forRun").mockResolvedValue(row as never);
    await expect(resolveModel("ada", { reasoningEffort: "ultra" })).rejects.toThrow(
      'Codex does not support the "ultra" reasoning effort',
    );
    forRun.mockRestore();
  });
});
