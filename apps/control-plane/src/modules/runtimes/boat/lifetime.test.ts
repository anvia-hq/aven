import { describe, expect, test } from "bun:test";

import { boatLifetime } from "./lifetime";

const MINUTE = 60_000;

describe("boat lifetime", () => {
  test("a sandbox that was just started may have stopped once its auto-stop is near, and one that was already running is looked at again soon", () => {
    boatLifetime.woke("started", true, 120 * MINUTE, 0);
    boatLifetime.woke("running", false, 120 * MINUTE, 0);

    expect(boatLifetime.mayHaveStopped("started", 114 * MINUTE)).toBe(false);
    expect(boatLifetime.mayHaveStopped("started", 115 * MINUTE)).toBe(true);
    expect(boatLifetime.mayHaveStopped("running", MINUTE)).toBe(false);
    expect(boatLifetime.mayHaveStopped("running", 2 * MINUTE)).toBe(true);
  });

  test("a sandbox nothing is known about is taken to be as it was", () => {
    expect(boatLifetime.mayHaveStopped("never-seen", Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});
