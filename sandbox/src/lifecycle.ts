import { EXTEND_EVERY_MS, shouldStopSandbox } from "./idle";
import type {
  DeleteRetryPlan,
  IdleWindows,
  LifecycleDecision,
  LifecyclePolicy,
  SandboxSnapshot,
  SpendState,
  SpendVerdict,
} from "./types";

const MINUTE_MS = 60_000;

const HOUR_MS = 3_600_000;

const MONTH_HOURS = 730;

export const DEFAULT_MAX_AGE_HOURS = 12;

export const DEFAULT_MAX_AGE_MS = DEFAULT_MAX_AGE_HOURS * HOUR_MS;

export const DEFAULT_DRAIN_GRACE_MS = 10 * MINUTE_MS;

export const DEFAULT_TRANSITION_WATCHDOG_MS = 10 * MINUTE_MS;

export const DEFAULT_MAX_DELETE_ATTEMPTS = 5;

export const SAVING_ENVIRONMENT_TTL_MS = 30 * MINUTE_MS;

export const FAILED_ENVIRONMENT_TTL_MS = 60 * MINUTE_MS;

export const DEFAULT_SOFT_BUDGET_PERCENT = 80;

export const DEFAULT_STOPPED_DISK_GB = 8;

const MIN_EXTEND_SECONDS = 60;

const DELETE_BACKOFF_MS = [
  1 * MINUTE_MS,
  5 * MINUTE_MS,
  30 * MINUTE_MS,
  2 * HOUR_MS,
  6 * HOUR_MS,
] as const;

export function clampedExtendTtlSeconds({
  autoStopSeconds,
  runningSince,
  maxAgeMs,
  drainGraceMs,
  now,
}: {
  autoStopSeconds: number;
  runningSince: number | null;
  maxAgeMs: number;
  drainGraceMs: number;
  now: number;
}): number | null {
  if (runningSince === null || maxAgeMs <= 0) return autoStopSeconds;

  const wallAt = runningSince + maxAgeMs + drainGraceMs;
  const remainingMs = wallAt - now;

  if (remainingMs <= 0) return null;

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  return Math.max(MIN_EXTEND_SECONDS, Math.min(autoStopSeconds, remainingSeconds));
}

export function deleteRetryPlan(
  attempts: number,
  now: number,
  maxAttempts = DEFAULT_MAX_DELETE_ATTEMPTS,
): DeleteRetryPlan {
  if (attempts >= maxAttempts) return { giveUp: true, nextRetryAt: null };

  const index = Math.min(Math.max(attempts - 1, 0), DELETE_BACKOFF_MS.length - 1);
  const delay = DELETE_BACKOFF_MS[index] ?? DELETE_BACKOFF_MS[DELETE_BACKOFF_MS.length - 1];
  return { giveUp: false, nextRetryAt: now + delay };
}

export function evaluateSpend({
  usedMicros,
  budgetMicros,
  softLimitPercent = DEFAULT_SOFT_BUDGET_PERCENT,
}: {
  usedMicros: number;
  budgetMicros: number | null;
  softLimitPercent?: number;
}): SpendVerdict {
  if (budgetMicros === null || budgetMicros <= 0) {
    return { state: "ok", usedMicros, budgetMicros, percent: 0 };
  }

  const percent = (usedMicros / budgetMicros) * 100;

  if (usedMicros >= budgetMicros) {
    return { state: "hard_stop", usedMicros, budgetMicros, percent };
  }

  if (percent >= softLimitPercent) {
    return { state: "soft_warn", usedMicros, budgetMicros, percent };
  }

  return { state: "ok", usedMicros, budgetMicros, percent };
}

export function effectiveIdleWindows(windows: IdleWindows, spendState: SpendState): IdleWindows {
  if (spendState !== "soft_warn") return windows;

  return {
    agentIdleMs: Math.max(60_000, Math.floor(windows.agentIdleMs / 2)),
    userIdleMs: Math.max(60_000, Math.floor(windows.userIdleMs / 2)),
  };
}

export function computeRunCostMicros(durationMs: number, microsPerHour: number): number {
  if (durationMs <= 0 || microsPerHour <= 0) return 0;

  return Math.round((durationMs / HOUR_MS) * microsPerHour);
}

export function computeStorageCostMicros(
  durationMs: number,
  gigabytes: number,
  microsPerGbMonth: number,
): number {
  if (durationMs <= 0 || gigabytes <= 0 || microsPerGbMonth <= 0) return 0;

  const hours = durationMs / HOUR_MS;
  return Math.round((hours / MONTH_HOURS) * gigabytes * microsPerGbMonth);
}

export function runtimeSnapshotName(runtimeId: string): string {
  return `aven-rt-${runtimeId.replaceAll("-", "").toLowerCase()}`.slice(0, 63);
}

export function decideSandboxAction(
  snapshot: SandboxSnapshot,
  policy: LifecyclePolicy,
  now: number,
  autoStopSeconds: number,
): LifecycleDecision {
  const { state } = snapshot;

  if (state === "absent" || state === "delete_failed") return { action: "noop" };

  if (state === "starting" || state === "stopping") {
    if (snapshot.expiresAt !== null && now >= snapshot.expiresAt) {
      return { action: "reconcile_stuck", state };
    }

    return { action: "noop" };
  }

  if (state === "deleting") {
    if (snapshot.nextRetryAt !== null) {
      return now >= snapshot.nextRetryAt
        ? { action: "delete", reason: "retry" }
        : { action: "noop" };
    }

    if (snapshot.expiresAt !== null && now >= snapshot.expiresAt) {
      return { action: "reconcile_stuck", state: "deleting" };
    }

    return { action: "noop" };
  }

  if (state === "stopped") {
    if (snapshot.drainingProvider) return { action: "delete", reason: "provider_switch" };

    const expireAt =
      snapshot.expiresAt ??
      (snapshot.stoppedAt !== null ? snapshot.stoppedAt + policy.expireMs : null);

    if (expireAt !== null && now >= expireAt) {
      return { action: "delete", reason: "expired" };
    }

    return { action: "noop" };
  }

  if (state === "draining") {
    if (!snapshot.agentRunning) {
      let reason: "provider_switch" | "budget" | "hard_wall" = "hard_wall";

      if (snapshot.drainingProvider) reason = "provider_switch";
      else if (snapshot.budgetExceeded) reason = "budget";

      return { action: "force_stop", reason };
    }

    const deadlineAt =
      snapshot.drainRequestedAt !== null
        ? snapshot.drainRequestedAt + policy.drainGraceMs
        : snapshot.expiresAt;

    if (deadlineAt !== null && now >= deadlineAt) {
      return { action: "force_stop", reason: "drain_timeout" };
    }

    return { action: "noop" };
  }

  if (snapshot.drainingProvider) {
    if (snapshot.agentRunning) {
      return {
        action: "drain",
        reason: "provider_switch",
        deadlineAt: now + policy.drainGraceMs,
      };
    }

    return { action: "force_stop", reason: "provider_switch" };
  }

  if (snapshot.budgetExceeded) {
    if (snapshot.agentRunning) {
      return { action: "drain", reason: "budget", deadlineAt: now + policy.drainGraceMs };
    }

    return { action: "force_stop", reason: "budget" };
  }

  const hardWallHit =
    policy.maxAgeMs > 0 &&
    snapshot.runningSince !== null &&
    now - snapshot.runningSince >= policy.maxAgeMs;

  if (hardWallHit) {
    if (snapshot.agentRunning) {
      return { action: "drain", reason: "hard_wall", deadlineAt: now + policy.drainGraceMs };
    }

    return { action: "force_stop", reason: "hard_wall" };
  }

  const idle = shouldStopSandbox({
    windows: { agentIdleMs: policy.agentIdleMs, userIdleMs: policy.userIdleMs },
    now,
    lastAgentAt: snapshot.lastAgentAt,
    lastUserAt: Math.max(snapshot.lastAgentAt, snapshot.lastActivityAt),
    agentRunning: snapshot.agentRunning,
  });

  if (idle) return { action: "force_stop", reason: "idle" };

  const extendEvery = policy.extendEveryMs > 0 ? policy.extendEveryMs : EXTEND_EVERY_MS;

  if (snapshot.lastExtendedAt !== null && now - snapshot.lastExtendedAt < extendEvery) {
    return { action: "noop" };
  }

  const ttlSeconds = clampedExtendTtlSeconds({
    autoStopSeconds,
    runningSince: snapshot.runningSince,
    maxAgeMs: policy.maxAgeMs,
    drainGraceMs: policy.drainGraceMs,
    now,
  });

  if (ttlSeconds === null) return { action: "noop" };

  return { action: "extend", ttlSeconds };
}
