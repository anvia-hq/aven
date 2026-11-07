import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { githubAppSetup } from "./app-setup";
import {
  appCallbackQuery,
  callbackQuery,
  connectQuery,
  installationParams,
  manifestQuery,
  userQuery,
} from "./schema";
import { githubService, InstallationNotAllowedError } from "./service";
import { githubUserTokenService } from "./user-tokens";

export const githubRouter = (
  service = githubService,
  userTokens: Pick<typeof githubUserTokenService, "status"> = githubUserTokenService,
  appSetup: Pick<
    typeof githubAppSetup,
    "canSetUp" | "canSetUpWorkspace" | "manifest" | "complete"
  > = githubAppSetup,
) =>
  new Elysia({ prefix: "/github" })
    .use(authRouter)
    .get(
      "/",
      async ({ organizationId, user }) => {
        const { configured, appKey, own } = await service.status(organizationId);
        return {
          configured,
          appKey,
          own,
          installUrl: configured ? await service.installUrl(organizationId, user.id) : null,
          canSetUp: await appSetup.canSetUp(user),
          canSetUpWorkspace: await appSetup.canSetUpWorkspace(user, organizationId),
        };
      },
      { auth: true, org: true },
    )
    .get(
      "/user",
      async ({ query, user, organizationId }) => {
        const appKey = query.app ?? (await service.status(organizationId)).appKey;
        const connected = await userTokens.status(user.id, appKey);
        return { connected: connected !== null, login: connected?.login ?? null, appKey };
      },
      { auth: true, org: true, query: userQuery },
    )
    .get(
      "/connect",
      async ({ query, organizationId, user, redirect }) =>
        redirect(await service.connectUrl(organizationId, user.id, query.next, query.app)),
      { auth: true, org: true, query: connectQuery },
    )
    .get(
      "/app/manifest",
      ({ query, user, organizationId }) =>
        appSetup.manifest(user, query, query.scope === "workspace" ? organizationId : undefined),
      { auth: true, org: true, query: manifestQuery },
    )
    .get(
      "/app/callback",
      async ({ query, user, organizationId, redirect }) => {
        await appSetup.complete(user, query, organizationId);
        return redirect(await service.installUrl(organizationId, user.id));
      },
      { auth: true, org: true, query: appCallbackQuery },
    )
    .get("/installations", ({ organizationId }) => service.list(organizationId), {
      auth: true,
      org: true,
    })
    .get(
      "/installations/:id/repos",
      ({ params, organizationId }) => service.repos(organizationId, params.id),
      { auth: true, org: true, params: installationParams },
    )
    .get(
      "/callback",
      async ({ query, organizationId, user, redirect }) => {
        if (query.state === undefined) {
          if (query.installation_id === undefined) {
            throw new InstallationNotAllowedError("The GitHub connection link is invalid");
          }
          return redirect(await service.claimUrl(organizationId, user.id, query.installation_id));
        }
        const { next } = await service.connect(organizationId, user.id, {
          installationId: query.installation_id,
          state: query.state,
          code: query.code,
        });
        return redirect(next ?? "/projects?github=connected");
      },
      { auth: true, org: true, query: callbackQuery },
    );
