import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { scheduleParams, updateScheduleBody } from "./schema";
import { schedulesService } from "./service";

// Schedules belong to the signed-in user, not to the active organization, so no `org: true`.
export const schedulesRouter = new Elysia({ prefix: "/schedules" })
  .use(authRouter)
  .get("/", ({ user }) => schedulesService.list(user.id), { auth: true })
  .patch("/:id", ({ user, params, body }) => schedulesService.update(user.id, params.id, body), {
    auth: true,
    params: scheduleParams,
    body: updateScheduleBody,
  })
  .delete(
    "/:id",
    async ({ user, params }) => {
      await schedulesService.remove(user.id, params.id);
      return { ok: true };
    },
    { auth: true, params: scheduleParams },
  );
