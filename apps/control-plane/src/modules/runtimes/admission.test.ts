import { describe, expect, test } from "bun:test";

import { UnavailableError } from "@aven/server-kit/errors";

import { createAdmission } from "./admission";
import type { CloudLifecycle } from "../cloud-lifecycle/types";
import type { ComputerStart } from "./types";

const OPEN: CloudLifecycle = {
  agentIdleSeconds: 300,
  userIdleSeconds: 1200,
  expireHours: 48,
  maxAgeHours: 12,
  maxRunning: null,
  startBurst: null,
  startEveryMinutes: 5,
  monthlyBudgetCents: null,
  softBudgetPercent: 80,
};

const MINUTE = 60_000;

const start: ComputerStart = { runtimeId: "r1", organizationId: "org", userId: "me" };

function harness(settings: Partial<CloudLifecycle>, counts: number[] = [0]) {
  const clock = { at: 0 };
  const slept: number[] = [];
  const extra: ComputerStart[] = [];
  let polls = 0;
  const admission = createAdmission({
    settings: async () => ({ ...OPEN, ...settings }),
    running: async () => counts[Math.min(polls++, counts.length - 1)] ?? 0,
    extra: async (each) => {
      extra.push(each);
    },
    now: () => clock.at,
    sleep: async (ms) => {
      slept.push(ms);
      clock.at += ms;
    },
  });
  return { admission, clock, slept, extra };
}

describe("admitting an Aven Cloud computer to start", () => {
  test("with no limit set it always admits, and asks the edition", async () => {
    const { admission, slept, extra } = harness({}, [500]);

    await admission.admit(start);

    expect(slept).toEqual([]);
    expect(extra).toEqual([start]);
  });

  test("a workspace at its running limit waits for one to stop, then starts", async () => {
    const { admission, slept } = harness({ maxRunning: 3 }, [3, 3, 2]);

    await admission.admit(start);

    expect(slept).toEqual([2000, 2000]);
  });

  test("a workspace that stays at its limit is told so, and nothing starts", async () => {
    const { admission, extra } = harness({ maxRunning: 3 }, [3]);

    await expect(admission.admit(start)).rejects.toThrow("3 Aven Cloud computers running");
    expect(extra).toEqual([]);
  });

  test("starts beyond the burst wait for the next one to be allowed", async () => {
    const { admission, slept } = harness({ startBurst: 2, startEveryMinutes: 1 });

    await admission.admit(start);
    await admission.admit(start);
    await admission.admit(start);

    expect(slept).toEqual([MINUTE]);
  });

  test("a wait too long to hold on to is refused with when to try again", async () => {
    const { admission } = harness({ startBurst: 1, startEveryMinutes: 15 });

    await admission.admit(start);

    await expect(admission.admit(start)).rejects.toThrow("in about 15 minutes");
    await expect(admission.admit(start)).rejects.toBeInstanceOf(UnavailableError);
  });

  test("the burst is each person's own, and refills with time", async () => {
    const { admission, clock } = harness({ startBurst: 1, startEveryMinutes: 15 });

    await admission.admit(start);
    await admission.admit({ ...start, userId: "someone-else" });

    clock.at += 15 * MINUTE;

    await admission.admit(start);
  });

  test("starts made at the same moment are spaced out, not all let through after one wait", async () => {
    const slept: number[] = [];
    const admission = createAdmission({
      settings: async () => ({ ...OPEN, startBurst: 1, startEveryMinutes: 1 }),
      running: async () => 0,
      now: () => 0,
      sleep: async (ms) => {
        slept.push(ms);
      },
    });

    const outcomes = await Promise.allSettled([
      admission.admit(start),
      admission.admit(start),
      admission.admit(start),
    ]);

    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      "fulfilled",
      "fulfilled",
      "rejected",
    ]);
    expect(slept).toEqual([MINUTE]);
  });

  test("what the edition refuses is refused", async () => {
    const admission = createAdmission({
      settings: async () => OPEN,
      running: async () => 0,
      extra: async () => {
        throw new UnavailableError("Your plan has no hours left");
      },
    });

    await expect(admission.admit(start)).rejects.toThrow("no hours left");
  });

  test("refuses new starts when the monthly spend brake trips", async () => {
    const admission = createAdmission({
      settings: async () => ({ ...OPEN, monthlyBudgetCents: 2000 }),
      running: async () => 0,
      spend: async () => ({
        state: "hard_stop",
        usedMicros: 20_000_000,
        budgetMicros: 20_000_000,
        percent: 100,
      }),
    });

    await expect(admission.admit(start)).rejects.toThrow("monthly spend limit");
  });

  test("omits Settings > Sandbox guidance when platform settings are hidden", async () => {
    const admission = createAdmission({
      settings: async () => ({ ...OPEN, monthlyBudgetCents: 2000 }),
      running: async () => 0,
      hidePlatformSettings: () => true,
      spend: async () => ({
        state: "hard_stop",
        usedMicros: 20_000_000,
        budgetMicros: 20_000_000,
        percent: 100,
      }),
    });

    await expect(admission.admit(start)).rejects.toThrow("contact support");
    await expect(admission.preflight(start)).rejects.not.toThrow("Settings > Sandbox");
  });

  test("preflight enforces spend and edition gates without consuming start burst tokens", async () => {
    const extra: ComputerStart[] = [];
    const admission = createAdmission({
      settings: async () => ({ ...OPEN, startBurst: 1, startEveryMinutes: 15 }),
      running: async () => 0,
      extra: async (each) => {
        extra.push(each);
      },
    });

    await admission.preflight(start);
    await admission.admit(start);

    expect(extra).toEqual([start, start]);
  });
});
