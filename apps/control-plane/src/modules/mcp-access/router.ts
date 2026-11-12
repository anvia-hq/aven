import { Elysia } from "elysia";

import { NotFoundError } from "../../errors";
import { authRouter } from "../auth/router";
import { accessTokenParams, createAccessTokenBody } from "./schema";
import { mcpAccessService } from "./service";

export const mcpAccessRouter = new Elysia({ prefix: "/mcp-access" })
  .use(authRouter)
  .get("/", ({ user }) => mcpAccessService.list(user.id), { auth: true })
  .post("/", ({ body, user }) => mcpAccessService.create(user.id, body), {
    auth: true,
    body: createAccessTokenBody,
  })
  .delete(
    "/:id",
    async ({ params, user }) => {
      if (!(await mcpAccessService.remove(user.id, params.id))) {
        throw new NotFoundError("Access token not found");
      }

      return { ok: true };
    },
    { auth: true, params: accessTokenParams },
  );
