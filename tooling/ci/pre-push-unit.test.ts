import { describe, expect, test } from "bun:test";

import { needsDatabase } from "./pre-push-unit";

describe("needsDatabase", () => {
  test("returns true when control-plane or db files change", () => {
    expect(needsDatabase(["apps/control-plane/src/modules/runs/service.ts"])).toBe(true);
    expect(needsDatabase(["packages/db/src/schema/threads.ts"])).toBe(true);
  });

  test("returns false for frontend, cli, runtime, and tooling files", () => {
    expect(
      needsDatabase([
        "apps/platform/src/modules/variables/parse-env.ts",
        "apps/cli/src/compose.ts",
        "tooling/ci/select-tests.ts",
      ]),
    ).toBe(false);
  });
});
