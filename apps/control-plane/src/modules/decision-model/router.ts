import { Elysia } from "elysia";

import { ForbiddenError, NotFoundError } from "@aven/server-kit/errors";
import { authRouter } from "../auth/router";
import { isOwnerOrAdmin } from "../auth/members";
import { saveDecisionModelBody } from "./schema";
import { decisionModelService } from "./service";

const ONLY_ADMINS = "Only an owner or an admin can set the decision model";

export const decisionModelRouter = new Elysia({ prefix: "/decision-model" })
  .use(authRouter)
  .get(
    "/",
    async ({ organizationId }) => ({
      decisionModel: await decisionModelService.get(organizationId),
    }),
    { auth: true, org: true },
  )
  .put(
    "/",
    async ({ body, organizationId, user }) => {
      if (!(await isOwnerOrAdmin(organizationId, user.id))) throw new ForbiddenError(ONLY_ADMINS);

      return decisionModelService.save(organizationId, body);
    },
    { auth: true, org: true, body: saveDecisionModelBody },
  )
  .delete(
    "/",
    async ({ organizationId, user }) => {
      if (!(await isOwnerOrAdmin(organizationId, user.id))) throw new ForbiddenError(ONLY_ADMINS);

      if (!(await decisionModelService.remove(organizationId))) {
        throw new NotFoundError("This workspace has no decision model of its own");
      }

      return { removed: true };
    },
    { auth: true, org: true },
  );
