import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { exchangePairingBody } from "./schema";
import { mobilePairService } from "./service";

export const mobilePairRouter = new Elysia({ prefix: "/mobile-pair" })
  .use(authRouter)
  .post(
    "/",
    async ({ user, organizationId, status }) =>
      status(201, await mobilePairService.create(user.id, organizationId)),
    { auth: true, org: true },
  )
  .post(
    "/exchange",
    async ({ body, request, set, status }) => {
      const exchanged = await mobilePairService.exchange(body.code, {
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent") ?? "AvenMobile",
      });

      if (!exchanged) return status(401, "Pairing code is invalid or expired");

      set.headers["set-auth-token"] = exchanged.token;
      return exchanged;
    },
    { body: exchangePairingBody },
  );
