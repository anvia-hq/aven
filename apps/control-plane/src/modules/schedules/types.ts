import type { createScheduler } from "./scheduler";

export type Scheduler = ReturnType<typeof createScheduler>;

export type ScheduleInput = {
  name: string;
  cron: string;
  prompt: string;
  timezone?: string;
  bot?: string;
};

export type SchedulePatch = Partial<ScheduleInput & { enabled: boolean }>;
