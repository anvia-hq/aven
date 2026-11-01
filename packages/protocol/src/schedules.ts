// A task a bot does again and again (decision 0067): limits and the shape a bot sees.

/** How many schedules a person may have, so a bot cannot fill the account. */
export const SCHEDULES_LIMIT = 50;
/** The least time between two runs of one schedule. */
export const SCHEDULE_MIN_INTERVAL_MS = 15 * 60_000;
/** How late a run may be and still be done: the control plane was off when it was due. */
export const SCHEDULE_CATCH_UP_MS = 6 * 3_600_000;
export const SCHEDULE_NAME_MAX = 80;
export const SCHEDULE_PROMPT_MAX = 20_000;

/** How the last time a schedule was due went. */
export type ScheduleStatus = "started" | "late" | "busy" | "missed" | "failed";

/** A schedule as a bot reads it: which bot runs it by handle, and its times as text. */
export type BotScheduleView = {
  id: string;
  /** The handle of the bot that runs it. */
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
