import { describe, expect, test } from "bun:test";

import { createModelCatalog, looksLikeChatModel } from "./model-catalog";

const catalog = {
  openai: {
    models: {
      "gpt-5.6": { tool_call: true, modalities: { output: ["text"] } },
      "o4-mini": { tool_call: true, modalities: { output: ["text"] }, status: "deprecated" },
      "gpt-image-2": { tool_call: false, modalities: { output: ["image"] } },
    },
  },
  anthropic: {
    models: {
      "claude-sonnet-5": { tool_call: true, modalities: { output: ["text"] } },
      "claude-haiku-5-5": {
        tool_call: true,
        modalities: { output: ["text"] },
        reasoning_options: [{ type: "toggle" }, { type: "effort", values: ["low", "high"] }],
      },
      "claude-haiku-4-5": {
        tool_call: true,
        modalities: { output: ["text"] },
        reasoning_options: [{ type: "budget_tokens", min: 1024 }],
      },
    },
  },
};

const url = () => "https://catalog.test/api.json";

const serving = (body: unknown, calls = { n: 0 }) =>
  Object.assign(
    (async () => {
      calls.n++;
      return Response.json(body);
    }) as unknown as typeof fetch,
    { calls },
  );

describe("modelCatalog", () => {
  test("keeps models that call tools and answer in text, and drops the rest", async () => {
    const models = createModelCatalog(serving(catalog), Date.now, url);
    const ids = ["gpt-5.6", "o4-mini", "gpt-image-2", "text-embedding-3-small", "whisper-1"];
    // o4-mini is deprecated, gpt-image-2 has no tools; the embedding and speech ids are unknown
    // to the catalog and fail the name check.
    expect(await models.chatModels("openai", ids)).toEqual(["gpt-5.6"]);
  });

  test("an id the catalog lacks falls back to the name check", async () => {
    const models = createModelCatalog(serving(catalog), Date.now, url);
    expect(await models.chatModels("openai", ["gpt-5.7-preview", "tts-2"])).toEqual([
      "gpt-5.7-preview",
    ]);
    expect(await models.chatModels("anthropic", ["claude-new-9", "other"])).toEqual([
      "claude-new-9",
    ]);
  });

  test("when models.dev is down it falls back to the name check, then retries later", async () => {
    let time = 0;
    let up = false;
    const calls = { n: 0 };
    const fetchFn = (async () => {
      calls.n++;
      if (!up) throw new Error("down");
      return Response.json(catalog);
    }) as unknown as typeof fetch;
    const models = createModelCatalog(fetchFn, () => time, url);

    expect(await models.chatModels("openai", ["gpt-5.6", "whisper-1", "o4-mini"])).toEqual([
      "gpt-5.6",
      "o4-mini",
    ]);
    await models.chatModels("openai", []);
    expect(calls.n).toBe(1);

    up = true;
    time += 6 * 60 * 1000;
    expect(await models.chatModels("openai", ["o4-mini"])).toEqual([]);
    expect(calls.n).toBe(2);
  });

  test("a stale catalog keeps serving when a refresh fails", async () => {
    let time = 0;
    let up = true;
    const fetchFn = (async () => {
      if (!up) throw new Error("down");
      return Response.json(catalog);
    }) as unknown as typeof fetch;
    const models = createModelCatalog(fetchFn, () => time, url);
    expect(await models.canRun("openai", "gpt-image-2")).toBe(false);

    up = false;
    time += 25 * 60 * 60 * 1000;
    expect(await models.canRun("openai", "gpt-image-2")).toBe(false);
  });

  test("canRun refuses only what the catalog says cannot run; compatible servers are never gated", async () => {
    const models = createModelCatalog(serving(catalog), Date.now, url);
    expect(await models.canRun("openai", "gpt-5.6")).toBe(true);
    expect(await models.canRun("openai", "o4-mini")).toBe(true);
    expect(await models.canRun("openai", "gpt-image-2")).toBe(false);
    expect(await models.canRun("openai-compatible", "anything")).toBe(true);
    expect(looksLikeChatModel("openai-compatible", "x")).toBe(true);
  });

  test("efforts are the levels the catalog lists, and none for other kinds of reasoning", async () => {
    const models = createModelCatalog(serving(catalog), Date.now, url);
    expect(await models.efforts("anthropic", "claude-haiku-5-5")).toEqual(["low", "high"]);
    expect(await models.efforts("anthropic", "claude-haiku-4-5")).toBeNull();
    expect(await models.efforts("anthropic", "unknown")).toBeNull();
    expect(await models.efforts("openai-compatible", "x")).toBeNull();
  });
});
