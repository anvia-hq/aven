import { describe, expect, test } from "bun:test";

import { COMPATIBLE_PRESETS } from "./presets";

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
    expect(COMPATIBLE_PRESETS.filter((preset) => !preset.needsKey).map((p) => p.id)).toEqual([
      "ollama",
    ]);
  });
});
