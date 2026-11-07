import { z } from "zod";

export const scheduleParams = z.object({ id: z.uuid() });

export const updateScheduleBody = z.object({ enabled: z.boolean() });
