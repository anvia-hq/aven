import { Elysia, status } from "elysia";

import { authRouter } from "../auth/router";
import { authService } from "../auth/service";
import type { PutAwayThread } from "../threads/types";
import { personParams, updateSettingsBody } from "./schema";
import { platformService } from "./service";

export const platformRouter = (putAway: PutAwayThread) => {
  return new Elysia({ prefix: "/platform" })
    .use(authRouter)
    .get("/config", async ({ request }) => {
      const session = await authService.getSession(request.headers);
      return {
        registrationEnabled: await platformService.isRegistrationEnabled(),
        isOwner: session ? await platformService.isOwner(session.user) : false,
      };
    })
    .get(
      "/users",
      async ({ user }) => {
        if (!(await platformService.isOwner(user))) return status(403, "Platform owners only");

        return platformService.listPeople();
      },
      { auth: true },
    )
    .delete(
      "/users/:id",
      async ({ params, user }) => {
        if (!(await platformService.isOwner(user))) return status(403, "Platform owners only");

        await platformService.removePerson(user, params.id, putAway);
        return { removed: true };
      },
      { auth: true, params: personParams },
    )
    .patch(
      "/settings",
      async ({ body, user }) => {
        if (!(await platformService.isOwner(user))) return status(403, "Platform owners only");

        await platformService.setRegistrationEnabled(body.registrationEnabled);
        return { registrationEnabled: body.registrationEnabled };
      },
      { auth: true, body: updateSettingsBody },
    );
};
