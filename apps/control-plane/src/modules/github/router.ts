import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { callbackQuery, connectQuery, installationParams } from "./schema";
import { githubService } from "./service";
import { githubUserTokenService } from "./user-tokens";

export const githubRouter = (
  service = githubService,
  userTokens: Pick<typeof githubUserTokenService, "status"> = githubUserTokenService,
) =>
  new Elysia({ prefix: "/github" })
    .use(authRouter)
    .get(
      "/",
      ({ organizationId, user }) => {
        const { configured } = service.status();
        return {
          configured,
          installUrl: configured ? service.installUrl(organizationId, user.id) : null,
        };
      },
      { auth: true, org: true },
    )
    // Whether the person has connected their GitHub account, which shipping acts as (decision 0041).
    .get(
      "/user",
      async ({ user }) => {
        const connected = await userTokens.status(user.id);
        return { connected: connected !== null, login: connected?.login ?? null };
      },
      { auth: true },
    )
    // Sends the browser to GitHub to connect the person's account, then back to `next`.
    .get(
      "/connect",
      ({ query, organizationId, user, redirect }) =>
        redirect(service.connectUrl(organizationId, user.id, query.next)),
      { auth: true, org: true, query: connectQuery },
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
        const { next } = await service.connect(organizationId, user.id, {
          installationId: query.installation_id,
          state: query.state,
          code: query.code,
        });
        return redirect(next ?? "/projects?github=connected");
      },
      { auth: true, org: true, query: callbackQuery },
    );
