import { Elysia } from "elysia";

import { auth, authService } from "./service";

// `auth` and `org` both need the session, so a request looks it up once.
const sessions = new WeakMap<Request, ReturnType<typeof authService.getSession>>();

function sessionOf(request: Request) {
  const cached = sessions.get(request);
  if (cached) return cached;
  const session = authService.getSession(request.headers);
  sessions.set(request, session);
  return session;
}

// Mount with `.use(authRouter)` and add `{ auth: true }` to a route to require a session, or
// `{ auth: true, org: true }` to also require (and inject) an active organization.
export const authRouter = new Elysia({ name: "auth" })
  .macro({
    auth: {
      async resolve({ request, status }) {
        const session = await sessionOf(request);
        if (!session) return status(401, "Unauthorized");
        return { user: session.user, session: session.session };
      },
    },
    org: {
      async resolve({ request, status }) {
        const session = await sessionOf(request);
        const organizationId = session?.session.activeOrganizationId;
        if (!organizationId) return status(400, "No active organization");
        return { organizationId };
      },
    },
  })
  .all("/auth/*", ({ request }) => auth.handler(request), { parse: "none" });
