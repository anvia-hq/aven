import { z } from "zod";

const wholeNumber = z.number().int().min(1);

export const saveCloudLifecycleBody = z.object({
  agentIdleSeconds: wholeNumber.max(7 * 24 * 3600),
  userIdleSeconds: wholeNumber.max(7 * 24 * 3600),
  expireHours: wholeNumber.max(24 * 365),
  maxRunning: wholeNumber.nullable(),
  startBurst: wholeNumber.nullable(),
  startEveryMinutes: wholeNumber.max(24 * 60),
});
