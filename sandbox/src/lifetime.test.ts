import { describe, expect, test } from "bun:test";

import { boatLifetime } from "./boat/lifetime";
import { createSandboxLifetime } from "./lifetime";
import { spacesLifetime } from "./spaces/lifetime";

const MINUTE = 60_000;

describe("sandbox lifetime", () => {
  const lifetime = createSandboxLifetime();

  test("a sandbox that was just started may have stopped once its auto-stop is near, and one that was already running is looked at again soon", () => {
    lifetime.woke("started", true, 120 * MINUTE, 0);
    lifetime.woke("running", false, 120 * MINUTE, 0);

    expect(lifetime.mayHaveStopped("started", 114 * MINUTE)).toBe(false);
    expect(lifetime.mayHaveStopped("started", 115 * MINUTE)).toBe(true);
    expect(lifetime.mayHaveStopped("running", MINUTE)).toBe(false);
    expect(lifetime.mayHaveStopped("running", 2 * MINUTE)).toBe(true);
  });

  test("a sandbox nothing is known about is taken to be as it was", () => {
    expect(lifetime.mayHaveStopped("never-seen", Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  test("a sandbox Aven stopped is woken again even while its runner is still connected", () => {
    lifetime.woke("busy", true, 120 * MINUTE, 0);

    expect(lifetime.mayHaveStopped("busy", 10 * MINUTE)).toBe(false);

    lifetime.stopped("busy", 12 * MINUTE);

    expect(lifetime.mayHaveStopped("busy", 12 * MINUTE)).toBe(true);
  });

  test("each provider keeps its own, so one provider's stop is not read as the other's", () => {
    boatLifetime.stopped("shared-runtime", 0);

    expect(boatLifetime.mayHaveStopped("shared-runtime", 1)).toBe(true);
    expect(spacesLifetime.mayHaveStopped("shared-runtime", 1)).toBe(false);
  });
});
