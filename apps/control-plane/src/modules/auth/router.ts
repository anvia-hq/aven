import { Elysia } from "elysia";

import { actingSession } from "./acting";
import { auth, authService } from "./service";

type AuthSession = Awaited<ReturnType<typeof authService.getSession>>;

const sessions = new WeakMap<Request, AuthSession>();
const pending = new WeakMap<Request, Promise<AuthSession>>();

async function lookUp(request: Request) {
  try {
    const session =
      (await actingSession(request.headers)) ?? (await authService.getSession(request.headers));
    sessions.set(request, session);
    return session;
  } finally {
    pending.delete(request);
  }
}

async function sessionOf(request: Request) {
  const cached = sessions.get(request);
  if (cached !== undefined) return cached;
  const inFlight = pending.get(request);
  if (inFlight) return inFlight;
  const lookup = lookUp(request);
  pending.set(request, lookup);
  return lookup;
}

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
        if (!session || !organizationId) return status(400, "No active organization");
        if (!(await authService.isMember(session.user.id, organizationId))) {
          return status(400, "No active organization");
        }
        return { organizationId };
      },
    },
  })
  .all("/auth/*", ({ request }) => auth.handler(request), { parse: "none" });
