import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import { profileService } from "./service";

export const profileRouter = new Elysia({ prefix: "/profile" })
  .use(authRouter)
  .get("/stats", ({ user }) => profileService.stats(user.id), { auth: true });
