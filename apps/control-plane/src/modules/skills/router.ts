import { Elysia, status } from "elysia";

import { authRouter } from "../auth/router";
import { skillParams, updateSkillBody, uploadSkillBody } from "./schema";
import { skillsService } from "./service";

// Skills belong to the signed-in user, not to the active organization, so no `org: true`.
export const skillsRouter = new Elysia({ prefix: "/skills" })
  .use(authRouter)
  .get("/", ({ user }) => skillsService.list(user.id), { auth: true })
  .get("/built-in", () => skillsService.listBuiltIn(), { auth: true })
  .post("/", ({ body, user }) => skillsService.upload(user.id, body), {
    auth: true,
    body: uploadSkillBody,
  })
  .patch(
    "/:id",
    async ({ params, body, user }) =>
      (await skillsService.update(user.id, params.id, body)) ?? status(404, "Skill not found"),
    { auth: true, params: skillParams, body: updateSkillBody },
  )
  .delete(
    "/:id",
    async ({ params, user }) =>
      (await skillsService.remove(user.id, params.id))
        ? { ok: true }
        : status(404, "Skill not found"),
    { auth: true, params: skillParams },
  );
