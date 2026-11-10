import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import {
  createFolderBody,
  folderParams,
  folderThreadParams,
  moveThreadBody,
  updateFolderBody,
} from "./schema";
import { foldersService } from "./service";

export const foldersRouter = new Elysia({ prefix: "/folders" })
  .use(authRouter)
  .get("/", ({ user }) => foldersService.list(user.id), { auth: true })
  .post("/", ({ user, body }) => foldersService.create(user.id, body.name), {
    auth: true,
    body: createFolderBody,
  })
  .put(
    "/threads/:threadId",
    ({ user, params, body }) => foldersService.moveThread(user.id, params.threadId, body.folderId),
    { auth: true, params: folderThreadParams, body: moveThreadBody },
  )
  .patch("/:id", ({ user, params, body }) => foldersService.update(user.id, params.id, body), {
    auth: true,
    params: folderParams,
    body: updateFolderBody,
  })
  .delete(
    "/:id",
    async ({ user, params }) => {
      await foldersService.remove(user.id, params.id);
      return { id: params.id };
    },
    { auth: true, params: folderParams },
  );
