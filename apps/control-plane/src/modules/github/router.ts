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
          // Which app the workspace acts as, and whether it is its own (decision 0123).
          appKey,
          own,
          installUrl: configured ? await service.installUrl(organizationId, user.id) : null,
          // A platform owner can have the app created from the platform (decision 0074).
          canSetUp: await appSetup.canSetUp(user),
          // An owner or an admin of the workspace can have it make its own app (decision 0123).
          canSetUpWorkspace: await appSetup.canSetUpWorkspace(user, organizationId),
        };
      },
      { auth: true, org: true },
    )
    // Whether the person has connected their GitHub account, which shipping acts as (decision 0041).
    .get(
      "/user",
      async ({ query, user, organizationId }) => {
        const appKey = query.app ?? (await service.status(organizationId)).appKey;
        const connected = await userTokens.status(user.id, appKey);
        return { connected: connected !== null, login: connected?.login ?? null, appKey };
      },
      { auth: true, org: true, query: userQuery },
    )
    // Sends the browser to GitHub to connect the person's account, then back to `next`.
    .get(
      "/connect",
      async ({ query, organizationId, user, redirect }) =>
        redirect(await service.connectUrl(organizationId, user.id, query.next, query.app)),
      { auth: true, org: true, query: connectQuery },
    )
    // What the platform posts to GitHub to have the app created, for a platform owner (decision 0074).
    .get(
      "/app/manifest",
      ({ query, user, organizationId }) =>
        appSetup.manifest(user, query, query.scope === "workspace" ? organizationId : undefined),
      { auth: true, org: true, query: manifestQuery },
    )
    // GitHub made the app and sends the browser back here with its code: keep the app, then on to
    // installing it on the person's account.
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
    // The app's "Callback URL": the browser comes back here after installing the app or connecting
    // an account, with the session cookie, through the platform's /api proxy.
    .get(
      "/callback",
      async ({ query, organizationId, user, redirect }) => {
        // GitHub sends no state when the app was installed from its own page, not from our link.
        // Its code cannot be trusted then (a forged link could carry anyone's), so the person
        // authorizes again through a state of ours that names the installation.
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
