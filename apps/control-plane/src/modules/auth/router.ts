import { Elysia } from "elysia";

import { auth, authService } from "./service";

// Mount with `.use(authRouter)` and add `{ auth: true }` to a route to require a session.
export const authRouter = new Elysia({ name: "auth" })
  .macro({
    auth: {
      async resolve({ request, status }) {
        const session = await authService.getSession(request.headers);
        if (!session) return status(401, "Unauthorized");
        return { user: session.user, session: session.session };
      },
    },
  })
  .all("/auth/*", ({ request }) => auth.handler(request), { parse: "none" });
