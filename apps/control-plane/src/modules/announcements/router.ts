import { Elysia, status } from "elysia";

import { authRouter } from "../auth/router";
import { platformService } from "../platform/service";
import { announcementParams, createAnnouncementBody, updateAnnouncementBody } from "./schema";
import { announcementsService } from "./service";

export const announcementsRouter = new Elysia({ prefix: "/announcements" })
  .use(authRouter)
  .get("/active", () => announcementsService.active(), { auth: true })
  .get(
    "/",
    async ({ user }) => {
      if (!(await platformService.isOwner(user))) return status(403, "Platform owners only");

      return announcementsService.list();
    },
    { auth: true },
  )
  .post(
    "/",
    async ({ body, user }) => {
      if (!(await platformService.isOwner(user))) return status(403, "Platform owners only");

      return announcementsService.create(body);
    },
    { auth: true, body: createAnnouncementBody },
  )
  .patch(
    "/:id",
    async ({ params, body, user }) => {
      if (!(await platformService.isOwner(user))) return status(403, "Platform owners only");

      return announcementsService.update(params.id, body);
    },
    { auth: true, params: announcementParams, body: updateAnnouncementBody },
  )
  .delete(
    "/:id",
    async ({ params, user }) => {
      if (!(await platformService.isOwner(user))) return status(403, "Platform owners only");

      await announcementsService.remove(params.id);
      return { removed: true };
    },
    { auth: true, params: announcementParams },
  );
