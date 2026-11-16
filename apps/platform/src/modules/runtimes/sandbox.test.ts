import { describe, expect, test } from "bun:test";

import { isSandbox } from "./sandbox";

describe("isSandbox", () => {
  test("the cloud template and a sandbox it created are both sandboxes", () => {
    expect(isSandbox({ isCloud: true, parentRuntimeId: null })).toBe(true);
    expect(isSandbox({ isCloud: false, parentRuntimeId: "cloud" })).toBe(true);
    expect(isSandbox({ isCloud: false, parentRuntimeId: null })).toBe(false);
    expect(isSandbox(undefined)).toBe(false);
  });
});
