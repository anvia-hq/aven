import { describe, expect, test } from "bun:test";

import {
  clampedExtendTtlSeconds,
  computeRunCostMicros,
  computeStorageCostMicros,
  decideSandboxAction,
  DEFAULT_DRAIN_GRACE_MS,
  DEFAULT_MAX_AGE_MS,
  DEFAULT_TRANSITION_WATCHDOG_MS,
  deleteRetryPlan,
  effectiveIdleWindows,
  evaluateSpend,
  runtimeSnapshotName,
} from "./lifecycle";
import type { LifecyclePolicy, SandboxSnapshot } from "./types";

const MINUTE = 60_000;
const HOUR = 3_600_000;

const POLICY: LifecyclePolicy = {
  agentIdleMs: 5 * MINUTE,
  userIdleMs: 20 * MINUTE,
  maxAgeMs: DEFAULT_MAX_AGE_MS,
  drainGraceMs: DEFAULT_DRAIN_GRACE_MS,
  expireMs: 48 * HOUR,
  extendEveryMs: 30 * MINUTE,
  transitionWatchdogMs: DEFAULT_TRANSITION_WATCHDOG_MS,
  maxDeleteAttempts: 5,
};

function baseSnapshot(overrides: Partial<SandboxSnapshot> = {}): SandboxSnapshot {
  return {
    runtimeId: "rt-1",
    state: "running",
    externalId: "bx_23456789",
    runtimeSnapshotName: null,
    dirty: false,
    runningSince: 0,
    lastActivityAt: 0,
    lastAgentAt: 0,
    agentRunning: false,
    stoppedAt: null,
    drainRequestedAt: null,
    lastExtendedAt: 0,
    expiresAt: 12 * HOUR,
    deleteAttempts: 0,
    nextRetryAt: null,
    drainingProvider: false,
    budgetExceeded: false,
    ...overrides,
  };
}

describe("sandbox lifecycle state machine", () => {
  test("stops an idle running sandbox after both agent and user windows pass", () => {
    const decision = decideSandboxAction(
      baseSnapshot({ lastActivityAt: 0, lastAgentAt: 0 }),
      POLICY,
      20 * MINUTE,
      7200,
    );

    expect(decision).toEqual({ action: "force_stop", reason: "idle" });
  });

  test("extends a running sandbox while active, clamping TTL to the 12h hard wall + drain grace", () => {
    const normal = decideSandboxAction(
      baseSnapshot({ runningSince: 0, lastActivityAt: 31 * MINUTE, lastExtendedAt: 0 }),
      POLICY,
      31 * MINUTE,
      7200,
    );
    expect(normal).toEqual({ action: "extend", ttlSeconds: 7200 });

    const nearWall = decideSandboxAction(
      baseSnapshot({
        runningSince: 0,
        lastActivityAt: 11 * HOUR + 40 * MINUTE,
        lastExtendedAt: 11 * HOUR,
      }),
      POLICY,
      11 * HOUR + 40 * MINUTE,
      7200,
    );
    expect(nearWall).toEqual({ action: "extend", ttlSeconds: 30 * 60 });
  });

  test("enforces the 12h hard wall even when an agent run is active by draining first", () => {
    const drain = decideSandboxAction(
      baseSnapshot({ runningSince: 0, lastActivityAt: 12 * HOUR, agentRunning: true }),
      POLICY,
      12 * HOUR,
      7200,
    );
    expect(drain).toEqual({
      action: "drain",
      reason: "hard_wall",
      deadlineAt: 12 * HOUR + DEFAULT_DRAIN_GRACE_MS,
    });

    const idleWall = decideSandboxAction(
      baseSnapshot({ runningSince: 0, lastActivityAt: 12 * HOUR, agentRunning: false }),
      POLICY,
      12 * HOUR,
      7200,
    );
    expect(idleWall).toEqual({ action: "force_stop", reason: "hard_wall" });
  });

  test("stops a draining sandbox once the run ends or when the grace cap elapses", () => {
    const waiting = decideSandboxAction(
      baseSnapshot({
        state: "draining",
        agentRunning: true,
        drainRequestedAt: 12 * HOUR,
      }),
      POLICY,
      12 * HOUR + 5 * MINUTE,
      7200,
    );
    expect(waiting).toEqual({ action: "noop" });

    const finished = decideSandboxAction(
      baseSnapshot({
        state: "draining",
        agentRunning: false,
        drainRequestedAt: 12 * HOUR,
      }),
      POLICY,
      12 * HOUR + 2 * MINUTE,
      7200,
    );
    expect(finished).toEqual({ action: "force_stop", reason: "hard_wall" });

    const timedOut = decideSandboxAction(
      baseSnapshot({
        state: "draining",
        agentRunning: true,
        drainRequestedAt: 12 * HOUR,
      }),
      POLICY,
      12 * HOUR + DEFAULT_DRAIN_GRACE_MS,
      7200,
    );
    expect(timedOut).toEqual({ action: "force_stop", reason: "drain_timeout" });
  });

  test("drains running boxes and deletes stopped boxes when their provider config is draining", () => {
    const running = decideSandboxAction(
      baseSnapshot({ drainingProvider: true, agentRunning: true }),
      POLICY,
      5 * MINUTE,
      7200,
    );
    expect(running.action).toBe("drain");

    const stopped = decideSandboxAction(
      baseSnapshot({
        state: "stopped",
        stoppedAt: 0,
        expiresAt: 48 * HOUR,
        drainingProvider: true,
      }),
      POLICY,
      5 * MINUTE,
      7200,
    );
    expect(stopped).toEqual({ action: "delete", reason: "provider_switch" });
  });

  test("enforces the spend brake with step-boundary drain on running sandboxes", () => {
    const running = decideSandboxAction(
      baseSnapshot({ budgetExceeded: true, agentRunning: true }),
      POLICY,
      5 * MINUTE,
      7200,
    );
    expect(running).toEqual({
      action: "drain",
      reason: "budget",
      deadlineAt: 5 * MINUTE + DEFAULT_DRAIN_GRACE_MS,
    });

    const idle = decideSandboxAction(
      baseSnapshot({ budgetExceeded: true, agentRunning: false, lastActivityAt: 5 * MINUTE }),
      POLICY,
      5 * MINUTE,
      7200,
    );
    expect(idle).toEqual({ action: "force_stop", reason: "budget" });
  });

  test("deletes stopped sandboxes after their 48h expiry and retries failed deletes with backoff", () => {
    const expired = decideSandboxAction(
      baseSnapshot({ state: "stopped", stoppedAt: 0, expiresAt: 48 * HOUR }),
      POLICY,
      48 * HOUR,
      7200,
    );
    expect(expired).toEqual({ action: "delete", reason: "expired" });

    const waitingRetry = decideSandboxAction(
      baseSnapshot({ state: "deleting", deleteAttempts: 2, nextRetryAt: 50 * HOUR }),
      POLICY,
      49 * HOUR,
      7200,
    );
    expect(waitingRetry).toEqual({ action: "noop" });

    const dueRetry = decideSandboxAction(
      baseSnapshot({ state: "deleting", deleteAttempts: 2, nextRetryAt: 50 * HOUR }),
      POLICY,
      50 * HOUR,
      7200,
    );
    expect(dueRetry).toEqual({ action: "delete", reason: "retry" });

    const parked = decideSandboxAction(
      baseSnapshot({ state: "delete_failed", deleteAttempts: 5 }),
      POLICY,
      100 * HOUR,
      7200,
    );
    expect(parked).toEqual({ action: "noop" });
  });

  test("reconciles stuck transient states past their watchdog deadline", () => {
    expect(
      decideSandboxAction(
        baseSnapshot({ state: "starting", expiresAt: 10 * MINUTE }),
        POLICY,
        10 * MINUTE,
        7200,
      ),
    ).toEqual({ action: "reconcile_stuck", state: "starting" });

    expect(
      decideSandboxAction(
        baseSnapshot({ state: "stopping", expiresAt: 10 * MINUTE }),
        POLICY,
        10 * MINUTE,
        7200,
      ),
    ).toEqual({ action: "reconcile_stuck", state: "stopping" });
  });
});

describe("lifecycle helpers", () => {
  test("clampedExtendTtlSeconds refuses to extend past the hard wall", () => {
    expect(
      clampedExtendTtlSeconds({
        autoStopSeconds: 7200,
        runningSince: 0,
        maxAgeMs: 12 * HOUR,
        drainGraceMs: 10 * MINUTE,
        now: 12 * HOUR + 11 * MINUTE,
      }),
    ).toBeNull();
  });

  test("deleteRetryPlan backs off exponentially and gives up at maxAttempts", () => {
    expect(deleteRetryPlan(1, 0, 5)).toEqual({ giveUp: false, nextRetryAt: 60_000 });
    expect(deleteRetryPlan(2, 0, 5)).toEqual({ giveUp: false, nextRetryAt: 5 * MINUTE });
    expect(deleteRetryPlan(5, 0, 5)).toEqual({ giveUp: true, nextRetryAt: null });
  });

  test("evaluateSpend and effectiveIdleWindows implement two-stage soft landing", () => {
    expect(evaluateSpend({ usedMicros: 500, budgetMicros: 1000 }).state).toBe("ok");
    expect(evaluateSpend({ usedMicros: 800, budgetMicros: 1000 }).state).toBe("soft_warn");
    expect(evaluateSpend({ usedMicros: 1000, budgetMicros: 1000 }).state).toBe("hard_stop");

    expect(
      effectiveIdleWindows({ agentIdleMs: 5 * MINUTE, userIdleMs: 20 * MINUTE }, "soft_warn"),
    ).toEqual({ agentIdleMs: 2.5 * MINUTE, userIdleMs: 10 * MINUTE });
  });

  test("cost and snapshot naming helpers produce expected values", () => {
    expect(computeRunCostMicros(2 * HOUR, 32_400)).toBe(64_800);
    expect(computeStorageCostMicros(730 * HOUR, 8, 140_000)).toBe(1_120_000);
    expect(runtimeSnapshotName("11111111-2222-3333-4444-555555555555")).toBe(
      "aven-rt-11111111222233334444555555555555",
    );
  });
});
