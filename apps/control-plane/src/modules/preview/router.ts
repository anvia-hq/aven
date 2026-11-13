import { Elysia } from "elysia";

import { ForbiddenError } from "../../errors";
import { ACTING_HEADER } from "../auth/acting";
import { authRouter } from "../auth/router";
import { runtimeParams } from "../runtimes/schema";
import { portBody } from "./schema";
import type { createPreviewService } from "./service";

export const previewRouter = (service: ReturnType<typeof createPreviewService>) =>
  new Elysia({ prefix: "/runtimes" }).use(authRouter).post(
    "/:id/ports",
    ({ params, body, organizationId, user, request }) => {
      if (request.headers.has(ACTING_HEADER))
        throw new ForbiddenError(
          "Only the person can open a preview: its panel asks them to confirm the port",
        );

      return service.open(organizationId, user.id, params.id, body.port);
    },
    { auth: true, org: true, params: runtimeParams, body: portBody },
  );
