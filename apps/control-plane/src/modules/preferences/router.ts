import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { timezoneBody } from "./schema";
import { preferencesService } from "./service";

// Preferences belong to the signed-in user, not to the active organization, so no `org: true`.
export const preferencesRouter = new Elysia({ prefix: "/preferences" })
  .use(authRouter)
  .get("/", ({ user }) => preferencesService.get(user.id), { auth: true })
  .put("/timezone", ({ user, body }) => preferencesService.setTimezone(user.id, body.timezone), {
    auth: true,
    body: timezoneBody,
  });
