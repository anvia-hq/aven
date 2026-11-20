import { z } from "zod";

import { DEFAULT_MAX_AGE_HOURS, DEFAULT_SOFT_BUDGET_PERCENT } from "@aven/sandbox/lifecycle";

const wholeNumber = z.number().int().min(1);

export const saveCloudLifecycleBody = z.object({
  agentIdleSeconds: wholeNumber.max(7 * 24 * 3600),
  userIdleSeconds: wholeNumber.max(7 * 24 * 3600),
  expireHours: wholeNumber.max(24 * 365),
  maxAgeHours: wholeNumber.max(24 * 7).default(DEFAULT_MAX_AGE_HOURS),
  maxRunning: wholeNumber.nullable(),
  startBurst: wholeNumber.nullable(),
  startEveryMinutes: wholeNumber.max(24 * 60),
  monthlyBudgetCents: wholeNumber.max(100_000_000).nullable().default(null),
  softBudgetPercent: z.number().int().min(1).max(99).default(DEFAULT_SOFT_BUDGET_PERCENT),
});
