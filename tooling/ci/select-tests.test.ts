import { describe, expect, test } from "bun:test";

import { FULL_RUN_INPUTS, selectTests } from "./select-tests";

describe("selectTests", () => {
  test("forces a full run when any global input changes", () => {
    for (const input of [
      "package.json",
      "bun.lock",
      "packages/protocol/src/types.ts",
      "packages/db/src/schema/users.ts",
    ]) {
      const plan = selectTests([input]);
      expect(plan.fullUnit).toBe(true);
      expect(plan.fullE2e).toBe(true);
    }

    expect(FULL_RUN_INPUTS).toContain("package.json");
    expect(FULL_RUN_INPUTS).toContain("playwright.config.ts");
  });

  test("narrows to module e2e specs and bun test --changed for a feature module change", () => {
    const plan = selectTests([
      "apps/platform/src/modules/variables/components/variables-section.tsx",
    ]);
    expect(plan.fullUnit).toBe(false);
    expect(plan.fullE2e).toBe(false);
    expect(plan.useBunChanged).toBe(true);
    expect(plan.e2eSpecs).toEqual(["e2e/variables.spec.ts"]);
  });

  test("selects only decision-folder test for docs/decision edits", () => {
    const plan = selectTests(["docs/decision/0394-fast-ci.md"]);
    expect(plan.fullUnit).toBe(false);
    expect(plan.fullE2e).toBe(false);
    expect(plan.useBunChanged).toBe(false);
    expect(plan.unitFiles).toEqual(["tooling/docs/decision-folder.test.mjs"]);
    expect(plan.e2eSpecs).toEqual([]);
  });

  test("falls back to full suite for unmapped shared source files", () => {
    const plan = selectTests(["apps/control-plane/src/memory-store.ts"]);
    expect(plan.fullUnit).toBe(true);
    expect(plan.fullE2e).toBe(true);
  });

  test("selects only unit tests for apps/cli changes", () => {
    const plan = selectTests(["apps/cli/src/compose.ts"]);
    expect(plan.fullUnit).toBe(false);
    expect(plan.fullE2e).toBe(false);
    expect(plan.useBunChanged).toBe(true);
    expect(plan.e2eSpecs).toEqual([]);
  });
});
