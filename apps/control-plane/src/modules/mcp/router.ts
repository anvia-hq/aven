import { Elysia } from "elysia";

import { NotFoundError, orNotFound } from "../../errors";
import { authRouter } from "../auth/router";
import { createMcpBody, mcpParams, updateMcpBody } from "./schema";
import { mcpService } from "./service";

// MCP servers belong to the signed-in user, not to the active organization, so no `org: true`.
// Headers go in and are never read back: a server's view has their names only.
export const mcpRouter = new Elysia({ prefix: "/mcp-servers" })
  .use(authRouter)
  .get("/", ({ user }) => mcpService.list(user.id), { auth: true })
  .post("/", ({ body, user }) => mcpService.create(user.id, body), {
    auth: true,
    body: createMcpBody,
  })
  .patch(
    "/:id",
    async ({ params, body, user }) =>
      orNotFound(await mcpService.update(user.id, params.id, body), "MCP server not found"),
    { auth: true, params: mcpParams, body: updateMcpBody },
  )
  .delete(
    "/:id",
    async ({ params, user }) => {
      if (!(await mcpService.remove(user.id, params.id))) {
        throw new NotFoundError("MCP server not found");
      }
      return { ok: true };
    },
    { auth: true, params: mcpParams },
  );
