import { Elysia, status } from "elysia";

import { createUserBody, updateUserBody, userParams } from "./schema";
import { usersService } from "./service";

export const usersRouter = new Elysia({ prefix: "/users" })
  .get("/", () => usersService.list())
  .get(
    "/:id",
    async ({ params }) => (await usersService.get(params.id)) ?? status(404, "User not found"),
    { params: userParams },
  )
  .post("/", ({ body }) => usersService.create(body), { body: createUserBody })
  .patch(
    "/:id",
    async ({ params, body }) =>
      (await usersService.update(params.id, body)) ?? status(404, "User not found"),
    { params: userParams, body: updateUserBody },
  );
