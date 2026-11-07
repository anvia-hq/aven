import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { timezoneBody } from "./schema";
import { preferencesService } from "./service";

export const preferencesRouter = new Elysia({ prefix: "/preferences" })
  .use(authRouter)
  .get("/", ({ user }) => preferencesService.get(user.id), { auth: true })
  .post(
    "/default-timezone",
    ({ user, body }) => preferencesService.setDefaultTimezone(user.id, body.timezone),
    { auth: true, body: timezoneBody },
  )
  .put("/timezone", ({ user, body }) => preferencesService.setTimezone(user.id, body.timezone), {
    auth: true,
    body: timezoneBody,
  });
