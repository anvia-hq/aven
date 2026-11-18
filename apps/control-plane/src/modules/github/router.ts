import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { githubAppSetup } from "./app-setup";
import {
  appCallbackQuery,
  callbackQuery,
  connectQuery,
  installationParams,
  manifestQuery,
} from "./schema";
import { githubService, InstallationNotAllowedError } from "./service";
import { githubUserTokenService } from "./user-tokens";

export const githubRouter = (
  service = githubService,
  userTokens: Pick<typeof githubUserTokenService, "status"> = githubUserTokenService,
  appSetup: Pick<typeof githubAppSetup, "canSetUp" | "manifest" | "complete"> = githubAppSetup,
) =>
  new Elysia({ prefix: "/github" })
    .use(authRouter)
    .get(
      "/",
      async ({ organizationId, user }) => {
        const { configured } = service.status();
        return {
          configured,
          installUrl: configured ? service.installUrl(organizationId, user.id) : null,
          canSetUp: await appSetup.canSetUp(user),
        };
      },
      { auth: true, org: true },
    )
    .get(
      "/user",
      async ({ user }) => {
        const connected = await userTokens.status(user.id);
        return {
          connected: connected !== null,
          login: connected?.login ?? null,
        };
      },
      { auth: true, org: true },
    )
    .get(
      "/connect",
      async ({ query, organizationId, user, redirect }) =>
        redirect(service.connectUrl(organizationId, user.id, query.next)),
      { auth: true, org: true, query: connectQuery },
    )
    .get("/app/manifest", ({ query, user }) => appSetup.manifest(user, query), {
      auth: true,
      org: true,
      query: manifestQuery,
    })
    .get(
      "/app/callback",
      async ({ query, user, organizationId, redirect }) => {
        await appSetup.complete(user, query);
        return redirect(service.installUrl(organizationId, user.id));
      },
      { auth: true, org: true, query: appCallbackQuery },
    )
    .get("/installations", ({ organizationId }) => service.list(organizationId), {
      auth: true,
      org: true,
    })
    .get(
      "/installations/:id",
      ({ params, organizationId }) => service.installation(organizationId, params.id),
      { auth: true, org: true, params: installationParams },
    )
    .get(
      "/installations/:id/repositories",
      ({ params, organizationId }) => service.repositories(organizationId, params.id),
      { auth: true, org: true, params: installationParams },
    )
    .get(
      "/callback",
      async ({ query, organizationId, user, redirect }) => {
        if (query.state === undefined) {
          if (query.installation_id === undefined) {
            throw new InstallationNotAllowedError("The GitHub connection link is invalid");
          }

          return redirect(service.claimUrl(organizationId, user.id, query.installation_id));
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
