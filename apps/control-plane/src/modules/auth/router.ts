import { Elysia } from "elysia";

import { auth, authService } from "./service";

// Mount with `.use(authRouter)` and add `{ auth: true }` to a route to require a session, or
// `{ auth: true, org: true }` to also require (and inject) an active organization.
export const authRouter = new Elysia({ name: "auth" })
  .macro({
    auth: {
      async resolve({ request, status }) {
        const session = await authService.getSession(request.headers);
        if (!session) return status(401, "Unauthorized");
        return { user: session.user, session: session.session };
      },
    },
    org: {
      async resolve({ request, status }) {
        const session = await authService.getSession(request.headers);
        const organizationId = session?.session.activeOrganizationId;
        if (!organizationId) return status(400, "No active organization");
        return { organizationId };
      },
    },
  })
  .all("/auth/*", ({ request }) => auth.handler(request), { parse: "none" });
