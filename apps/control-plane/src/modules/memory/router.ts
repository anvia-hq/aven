import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { createNoteBody, noteParams, updateNoteBody } from "./schema";
import { memoryService } from "./service";

export const memoryRouter = new Elysia({ prefix: "/memory" })
  .use(authRouter)
  .get("/", ({ user }) => memoryService.list(user.id), { auth: true })
  .get("/history", ({ user }) => memoryService.history(user.id), { auth: true })
  .post("/", ({ body, user }) => memoryService.create(user.id, body), {
    auth: true,
    body: createNoteBody,
  })
  .patch("/:id", ({ params, body, user }) => memoryService.update(user.id, params.id, body), {
    auth: true,
    params: noteParams,
    body: updateNoteBody,
  })
  .delete(
    "/:id",
    async ({ params, user, set }) => {
      await memoryService.removeById(user.id, params.id);
      set.status = 204;
    },
    { auth: true, params: noteParams },
  );
