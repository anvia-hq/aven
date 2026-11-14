import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { requirePlatformOwner } from "../platform/owner";
import { announcementParams, createAnnouncementBody, updateAnnouncementBody } from "./schema";
import { announcementsService } from "./service";

export const announcementsRouter = new Elysia({ prefix: "/announcements" })
  .use(authRouter)
  .get("/active", () => announcementsService.active(), { auth: true })
  .get(
    "/",
    async ({ user }) => {
      await requirePlatformOwner(user);

      return announcementsService.list();
    },
    { auth: true },
  )
  .post(
    "/",
    async ({ body, user }) => {
      await requirePlatformOwner(user);

      return announcementsService.create(body);
    },
    { auth: true, body: createAnnouncementBody },
  )
  .patch(
    "/:id",
    async ({ params, body, user }) => {
      await requirePlatformOwner(user);

      return announcementsService.update(params.id, body);
    },
    { auth: true, params: announcementParams, body: updateAnnouncementBody },
  )
  .delete(
    "/:id",
    async ({ params, user }) => {
      await requirePlatformOwner(user);

      await announcementsService.remove(params.id);
      return { removed: true };
    },
    { auth: true, params: announcementParams },
  );
