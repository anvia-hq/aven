import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { authService, emailLoginEnabled, githubLoginEnabled } from "../auth/service";
import type { PutAwayThread } from "../threads/types";
import { requirePlatformOwner } from "./owner";
import { personParams, updateSettingsBody } from "./schema";
import { platformService } from "./service";

export const platformRouter = (putAway: PutAwayThread) => {
  return new Elysia({ prefix: "/platform" })
    .use(authRouter)
    .get("/config", async ({ request }) => {
      const session = await authService.getSession(request.headers);
      return {
        registrationEnabled: await platformService.isRegistrationEnabled(),
        githubLogin: githubLoginEnabled,
        emailLogin: emailLoginEnabled,
        isOwner: session ? await platformService.isOwner(session.user) : false,
      };
    })
    .get(
      "/users",
      async ({ user }) => {
        await requirePlatformOwner(user);

        return platformService.listPeople();
      },
      { auth: true },
    )
    .delete(
      "/users/:id",
      async ({ params, user }) => {
        await requirePlatformOwner(user);

        await platformService.removePerson(user, params.id, putAway);
        return { removed: true };
      },
      { auth: true, params: personParams },
    )
    .patch(
      "/settings",
      async ({ body, user }) => {
        await requirePlatformOwner(user);

        await platformService.setRegistrationEnabled(body.registrationEnabled);
        return { registrationEnabled: body.registrationEnabled };
      },
      { auth: true, body: updateSettingsBody },
    );
};
