import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { dashboardStats } from "./schema";
import { dashboardService } from "./service";

export const dashboardRouter = new Elysia({ prefix: "/dashboard" })
  .use(authRouter)
  .get("/stats", () => dashboardService.stats(), { auth: true, response: dashboardStats });
