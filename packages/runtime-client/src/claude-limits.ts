import type { PlanLimit, PlanLimitStatus, PlanLimitWindow } from "@aven/protocol/types";

const WINDOWS: Record<string, PlanLimitWindow> = {
  five_hour: "five_hour",
  seven_day: "seven_day",
};

const STATUSES: readonly PlanLimitStatus[] = ["allowed", "allowed_warning", "rejected"];

const SECONDS_BELOW = 1e11;

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const milliseconds = (value: number) => (value < SECONDS_BELOW ? value * 1000 : value);

function limitOf(window: PlanLimitWindow, data: Record<string, unknown>): PlanLimit | undefined {
  const status = STATUSES.find((item) => item === data.status);

  if (!status || !finite(data.utilization)) return undefined;

  const percent = clampPercent(data.utilization <= 1 ? data.utilization * 100 : data.utilization);
  const limit: PlanLimit = { window, status, percent };

  if (finite(data.resetsAt)) limit.resetsAt = milliseconds(data.resetsAt);

  return limit;
}

export function limitsFromRateLimitEvent(info: unknown): PlanLimit[] {
  const data = record(info);
  const limits: PlanLimit[] = [];
  const windows = record(data.unifiedWindows);

  for (const [key, window] of Object.entries(WINDOWS)) {
    const limit = limitOf(window, record(windows[key]));

    if (limit) limits.push(limit);
  }

  if (limits.length > 0) return limits;

  const window = typeof data.rateLimitType === "string" ? WINDOWS[data.rateLimitType] : undefined;
  const single = window ? limitOf(window, data) : undefined;

  return single ? [single] : [];
}

export function limitsFromUsage(usage: unknown): PlanLimit[] {
  const data = record(usage);

  if (data.rate_limits_available !== true) return [];

  const windows = record(data.rate_limits);
  const limits: PlanLimit[] = [];

  for (const [key, window] of Object.entries(WINDOWS)) {
    const item = record(windows[key]);

    if (!finite(item.utilization)) continue;

    const limit: PlanLimit = {
      window,
      status: "allowed",
      percent: clampPercent(item.utilization),
    };
    const resets = typeof item.resets_at === "string" ? Date.parse(item.resets_at) : Number.NaN;

    if (Number.isFinite(resets)) limit.resetsAt = resets;

    limits.push(limit);
  }

  return limits;
}
