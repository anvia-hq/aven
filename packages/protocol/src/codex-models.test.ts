import { describe, expect, test } from "bun:test";

import {
  CODEX_DEFAULT_EFFORT,
  CODEX_MODELS,
  codexContextOf,
  codexEffortOf,
  codexNameOf,
  codexResolvedOf,
} from "./codex-models";

describe("codex models", () => {
  test("names the families and resolves each alias, including the default", () => {
    expect(codexNameOf("sol")).toBe("Sol");
    expect(codexNameOf(undefined)).toBe("Astra");
    expect(codexNameOf("terra")).toBe("Terra");
    expect(codexNameOf("gpt-x")).toBe("gpt-x");
    expect(codexResolvedOf(undefined)).toBe("gpt-6-astra");
    expect(codexResolvedOf("luna")).toBe("gpt-6-luna");
    expect(codexContextOf("terra")).toBe(500_000);
    expect(CODEX_MODELS.map((model) => model.resolved)).toEqual([
      "gpt-6-astra",
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6.1-terra",
      "gpt-6-luna",
    ]);
  });

  test("keeps the efforts the Codex CLI accepts, and drops one it does not", () => {
    expect(codexEffortOf("high")).toBe("high");
    expect(codexEffortOf("ultra")).toBe("ultra");
    expect(codexEffortOf("minimal")).toBeUndefined();
    expect(codexEffortOf("persistent")).toBeUndefined();
    expect(CODEX_DEFAULT_EFFORT).toBe("medium");
  });
});
