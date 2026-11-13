import { CLAUDE_DEFAULT_EFFORT } from "@aven/protocol/claude-models";
import { describe, expect, test } from "bun:test";

import { runSelectionOf } from "./run-selection";

describe("runSelectionOf", () => {
  const provider = { providerId: "p1", modelId: "m1", reasoningEffort: "high" };

  test("keeps the provider's choice when the thread is not a Claude one", () => {
    expect(runSelectionOf(null, provider)).toEqual(provider);
    expect(runSelectionOf(undefined, provider)).toEqual(provider);
  });

  test("uses the composer's Claude model and effort, with the default effort when none is picked", () => {
    expect(runSelectionOf({ modelId: "opus", effort: "max" }, provider)).toEqual({
      modelId: "opus",
      reasoningEffort: "max",
    });
    expect(runSelectionOf({}, provider)).toEqual({
      modelId: undefined,
      reasoningEffort: CLAUDE_DEFAULT_EFFORT,
    });
  });
});
