import { Elysia } from "elysia";

import { editionInUse } from "../../edition/current";
import { authRouter } from "../auth/router";
import { lensEnabled } from "../lens/flag";
import { previewDomain } from "../preview/config";
import { claudeBackendEnabled, codexBackendEnabled } from "../providers/backends";
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
        claudeBackend: claudeBackendEnabled(),
        codexBackend: codexBackendEnabled(),
        lens: lensEnabled(),
        isOwner: session ? await platformService.isOwner(session.user) : false,
        platformSettings: !editionInUse.current.hidePlatformSettings,
        manageUrl: editionInUse.current.manageUrl,
        previewDomain: previewDomain(process.env.AVEN_PREVIEW_DOMAIN) ?? null,
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
