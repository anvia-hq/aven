import { z } from "zod";

export const scheduleParams = z.object({ id: z.uuid() });

// The person pauses and resumes a schedule; changing what it does is for the bot, or the person
// asking it.
export const updateScheduleBody = z.object({ enabled: z.boolean() });
