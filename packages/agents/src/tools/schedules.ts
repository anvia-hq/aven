import { createTool } from "@anvia/core";
import { SCHEDULE_NAME_MAX, SCHEDULE_PROMPT_MAX } from "@aven/protocol/schedules";
import { z } from "zod";
import type { ScheduleHost } from "./types";

export const CREATE_SCHEDULE_TOOL_NAME = "create_schedule";
export const LIST_SCHEDULES_TOOL_NAME = "list_schedules";
export const UPDATE_SCHEDULE_TOOL_NAME = "update_schedule";
export const DELETE_SCHEDULE_TOOL_NAME = "delete_schedule";

const name = z.string().trim().min(1).max(SCHEDULE_NAME_MAX).describe("A short label.");
const cron = z
  .string()
  .trim()
  .min(1)
  .describe(
    "Five fields: minute hour day-of-month month day-of-week, for example `0 7 * * *` (every day at 07:00) or `30 8 * * mon-fri`. Nicknames such as @daily work. Seconds are not supported, and it cannot run more than once every 15 minutes.",
  );
const timezone = z
  .string()
  .trim()
  .min(1)
  .describe(
    "An IANA timezone such as Asia/Jakarta. Leave it out to use the person's, shown in your instructions.",
  );
const prompt = z
  .string()
  .trim()
  .min(1)
  .max(SCHEDULE_PROMPT_MAX)
  .describe(
    "The complete task, written to yourself. It runs later with no one to ask, so include what to do, what to use, and where the result goes (for example: tell the person with send_message).",
  );
const bot = z
  .string()
  .trim()
  .min(1)
  .describe("The handle of the bot that runs it. Leave it out to run it yourself.");

const createSchema = z.object({
  name,
  cron,
  prompt,
  timezone: timezone.optional(),
  bot: bot.optional(),
});
const updateSchema = z.object({
  id: z.uuid().describe("The schedule id from list_schedules."),
  name: name.optional(),
  cron: cron.optional(),
  prompt: prompt.optional(),
  timezone: timezone.optional(),
  enabled: z.boolean().optional(),
  bot: bot.optional(),
});

export type ScheduleInput = z.infer<typeof createSchema>;
export type SchedulePatch = Omit<z.infer<typeof updateSchema>, "id">;

export function createScheduleTools(host: ScheduleHost) {
  const create = createTool({
    name: CREATE_SCHEDULE_TOOL_NAME,
    description:
      "Schedule a task to run again and again, like cron, when the person asks for something on a schedule (for example every morning). At each time the app wakes the bot with the task. Tell the person what you scheduled and when it runs next.",
    inputSchema: createSchema,
    handler: async (input) => ({ schedule: await host.create(input) }),
  });
  const list = createTool({
    name: LIST_SCHEDULES_TOOL_NAME,
    description:
      "List every schedule: which bot runs it, when, whether it is enabled, and how the last run went.",
    inputSchema: z.object({}),
    handler: async () => ({ schedules: await host.list() }),
  });
  const update = createTool({
    name: UPDATE_SCHEDULE_TOOL_NAME,
    description:
      "Change a schedule. Give only what changes. Use enabled: false to pause it and enabled: true to resume it.",
    inputSchema: updateSchema,
    handler: async ({ id, ...patch }) => ({ schedule: await host.update(id, patch) }),
  });
  const remove = createTool({
    name: DELETE_SCHEDULE_TOOL_NAME,
    description: "Delete a schedule for good. Pause it instead if unsure.",
    inputSchema: z.object({ id: z.uuid().describe("The schedule id from list_schedules.") }),
    handler: async ({ id }) => {
      await host.remove(id);
      return { deleted: true };
    },
  });
  return [create, list, update, remove] as const;
}
