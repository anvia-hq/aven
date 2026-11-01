import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { timezoneBody } from "./schema";
import { preferencesService } from "./service";

// Preferences belong to the signed-in user, not to the active organization, so no `org: true`.
export const preferencesRouter = new Elysia({ prefix: "/preferences" })
  .use(authRouter)
  .get("/", ({ user }) => preferencesService.get(user.id), { auth: true })
  // What a browser says its timezone is, kept only when none is chosen yet.
  .post(
    "/default-timezone",
    ({ user, body }) => preferencesService.setDefaultTimezone(user.id, body.timezone),
    { auth: true, body: timezoneBody },
  )
  .put("/timezone", ({ user, body }) => preferencesService.setTimezone(user.id, body.timezone), {
    auth: true,
    body: timezoneBody,
  });
