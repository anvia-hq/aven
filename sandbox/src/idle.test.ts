import { describe, expect, test } from "bun:test";

import { idleCheckMs, idleWindows, shouldStopSandbox } from "./idle";

const MINUTE = 60_000;

const windows = { agentIdleMs: 5 * MINUTE, userIdleMs: 20 * MINUTE };

const env = (values: Record<string, string> = {}) => values;

describe("stopping an idle Aven Cloud sandbox", () => {
  const at = (minutes: number, lastAgent: number, lastUser = 0, agentRunning = false) =>
    shouldStopSandbox({
      windows,
      now: minutes * MINUTE,
      lastAgentAt: lastAgent * MINUTE,
      lastUserAt: lastUser * MINUTE,
      agentRunning,
    });

  test("waits for both windows: five minutes without agent work and twenty without a person", () => {
    expect(at(4, 0)).toBe(false);
    expect(at(5, 0)).toBe(false);
    expect(at(19, 0)).toBe(false);
    expect(at(20, 0)).toBe(true);
  });

  test("keeps the sandbox while a run is going, however long it has been", () => {
    expect(at(600, 0, 0, true)).toBe(false);
  });

  test("a person who just did something keeps it, and stops it twenty minutes after", () => {
    expect(at(19, 0, 0)).toBe(false);
    expect(at(20, 0, 0)).toBe(true);

    expect(at(18, 0, 15)).toBe(false);
    expect(at(34, 0, 15)).toBe(false);
    expect(at(34, 0, 14)).toBe(true);
    expect(at(35, 0, 15)).toBe(true);
  });

  test("agent work in the last five minutes keeps it even after the person has gone", () => {
    expect(at(25, 22)).toBe(false);
    expect(at(28, 23)).toBe(true);
  });
});

describe("the Aven Cloud idle settings", () => {
  test("are five minutes of no agent work and twenty of no person, checked every minute", () => {
    expect(idleWindows(env())).toEqual({ agentIdleMs: 5 * MINUTE, userIdleMs: 20 * MINUTE });
    expect(idleCheckMs(env())).toBe(MINUTE);
  });

  test("take whole seconds from the environment, and ignore anything that is not one", () => {
    expect(
      idleWindows(
        env({ AVEN_CLOUD_AGENT_IDLE_SECONDS: "600", AVEN_CLOUD_USER_IDLE_SECONDS: "3600" }),
      ),
    ).toEqual({ agentIdleMs: 10 * MINUTE, userIdleMs: 60 * MINUTE });
    expect(idleCheckMs(env({ AVEN_CLOUD_IDLE_CHECK_SECONDS: "15" }))).toBe(15_000);

    for (const bad of ["0", "-5", "1.5", "soon", ""]) {
      expect(idleCheckMs(env({ AVEN_CLOUD_IDLE_CHECK_SECONDS: bad }))).toBe(MINUTE);
    }
  });
});
