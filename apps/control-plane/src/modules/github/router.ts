import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { callbackQuery, installationParams } from "./schema";
import { githubService } from "./service";

export const githubRouter = new Elysia({ prefix: "/github" })
  .use(authRouter)
  .get(
    "/",
    ({ organizationId, user }) => {
      const { configured } = githubService.status();
      return {
        configured,
        installUrl: configured ? githubService.installUrl(organizationId, user.id) : null,
      };
    },
    { auth: true, org: true },
  )
  .get("/installations", ({ organizationId }) => githubService.list(organizationId), {
    auth: true,
    org: true,
  })
  .get(
    "/installations/:id/repos",
    ({ params, organizationId }) => githubService.repos(organizationId, params.id),
    { auth: true, org: true, params: installationParams },
  )
  // The app's "Callback URL": the browser comes back here after installing the app, with the session
  // cookie, through the platform's /api proxy.
  .get(
    "/callback",
    async ({ query, organizationId, user, redirect }) => {
      await githubService.connect(organizationId, user.id, {
        installationId: query.installation_id,
        state: query.state,
        code: query.code,
      });
      return redirect("/projects?github=connected");
    },
    { auth: true, org: true, query: callbackQuery },
  );
