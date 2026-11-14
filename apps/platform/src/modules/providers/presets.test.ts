import { describe, expect, test } from "bun:test";

import { COMPATIBLE_PRESETS, presetOf } from "./presets";

describe("COMPATIBLE_PRESETS", () => {
  test("are the six services, each with its own id, name and address", () => {
    expect(COMPATIBLE_PRESETS.map((preset) => preset.id)).toEqual([
      "openrouter",
      "groq",
      "deepseek",
      "mistral",
      "xai",
      "ollama",
    ]);
    for (const key of ["id", "name", "baseUrl"] as const) {
      expect(new Set(COMPATIBLE_PRESETS.map((preset) => preset[key])).size).toBe(
        COMPATIBLE_PRESETS.length,
      );
    }
  });

  test("have addresses the server accepts: http(s), no trailing slash, https unless local", () => {
    for (const { baseUrl, needsKey } of COMPATIBLE_PRESETS) {
      const url = new URL(baseUrl);
      expect(baseUrl.endsWith("/")).toBe(false);
      expect(url.protocol).toBe(needsKey ? "https:" : "http:");
    }
  });

  test("only a server on the person's own machine goes without a key", () => {
    expect(COMPATIBLE_PRESETS.flatMap((preset) => (preset.needsKey ? [] : [preset.id]))).toEqual([
      "ollama",
    ]);
  });
});

describe("presetOf", () => {
  const saved = (kind: string, baseUrl: string | null) => ({ kind, baseUrl });

  test("finds the panel a saved compatible provider belongs to, by its address", () => {
    expect(presetOf(saved("openai-compatible", "https://api.groq.com/openai/v1"))?.id).toBe("groq");
    expect(presetOf(saved("openai-compatible", "https://api.groq.com/openai/v1/"))?.id).toBe(
      "groq",
    );
  });

  test("leaves other servers and other kinds to the generic panel", () => {
    expect(presetOf(saved("openai-compatible", "https://my.vllm.example/v1"))).toBeUndefined();
    expect(presetOf(saved("openai-compatible", null))).toBeUndefined();
    expect(presetOf(saved("openai", "https://api.groq.com/openai/v1"))).toBeUndefined();
  });
});
