import { Elysia, status } from "elysia";

import { authRouter } from "../auth/router";
import { updateUserBody, userParams } from "./schema";
import { usersService } from "./service";

export const usersRouter = new Elysia({ prefix: "/users" })
  .use(authRouter)
  .get("/", () => usersService.list(), { auth: true })
  .get(
    "/:id",
    async ({ params }) => (await usersService.get(params.id)) ?? status(404, "User not found"),
    {
      auth: true,
      params: userParams,
    },
  )
  .patch(
    "/:id",
    async ({ params, body, user }) => {
      if (params.id !== user.id) return status(403, "You can only update your own profile");
      return (await usersService.update(params.id, body)) ?? status(404, "User not found");
    },
    { auth: true, params: userParams, body: updateUserBody },
  );
