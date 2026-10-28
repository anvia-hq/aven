import { Elysia, status } from "elysia";

import { authRouter } from "../auth/router";
import { authService } from "../auth/service";
import { updateSettingsBody } from "./schema";
import { platformService } from "./service";

export const platformRouter = new Elysia({ prefix: "/platform" })
  .use(authRouter)
  // Public: the register page needs to know whether sign-ups are open before anyone is signed in.
  .get("/config", async ({ request }) => {
    const session = await authService.getSession(request.headers);
    return {
      registrationEnabled: await platformService.isRegistrationEnabled(),
      isOwner: session ? platformService.isOwner(session.user.email) : false,
    };
  })
  .patch(
    "/settings",
    async ({ body, user }) => {
      if (!platformService.isOwner(user.email)) return status(403, "Platform owners only");
      await platformService.setRegistrationEnabled(body.registrationEnabled);
      return { registrationEnabled: body.registrationEnabled };
    },
    { auth: true, body: updateSettingsBody },
  );
