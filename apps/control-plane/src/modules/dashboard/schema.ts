import { z } from "zod";

export const dashboardStats = z.object({
  users: z.number(),
  activeSessions: z.number(),
  signupsLast7Days: z.number(),
});

export type DashboardStats = z.infer<typeof dashboardStats>;
