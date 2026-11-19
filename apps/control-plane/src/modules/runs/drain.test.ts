import { describe, expect, test } from "bun:test";
import { shutdownDrainMs } from "./drain";

describe("shutdownDrainMs", () => {
  test("waits two minutes when nothing is set", () => {
    expect(shutdownDrainMs(undefined)).toBe(120_000);
    expect(shutdownDrainMs("")).toBe(120_000);
  });

  test("takes seconds, zero meaning do not wait", () => {
    expect(shutdownDrainMs("45")).toBe(45_000);
    expect(shutdownDrainMs("0")).toBe(0);
  });

  test("falls back to the default for a setting that is not a number of seconds", () => {
    expect(shutdownDrainMs("soon")).toBe(120_000);
    expect(shutdownDrainMs("-5")).toBe(120_000);
  });
});
