export const SCHEDULES_LIMIT = 50;
export const SCHEDULE_MIN_INTERVAL_MS = 15 * 60_000;
export const SCHEDULE_CATCH_UP_MS = 6 * 3_600_000;
export const SCHEDULE_NAME_MAX = 80;
export const SCHEDULE_PROMPT_MAX = 20_000;

export type ScheduleStatus = "started" | "late" | "busy" | "missed" | "failed";

export type BotScheduleView = {
  id: string;
  bot: string;
  name: string;
  cron: string;
  timezone: string;
  prompt: string;
  enabled: boolean;
  nextRun: string | null;
  lastRun: string | null;
  lastStatus: ScheduleStatus | null;
};
