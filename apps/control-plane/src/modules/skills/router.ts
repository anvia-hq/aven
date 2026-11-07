import { Elysia } from "elysia";

import { NotFoundError, orNotFound } from "../../errors";
import { authRouter } from "../auth/router";
import { skillParams, updateSkillBody, uploadSkillBody } from "./schema";
import { skillsService } from "./service";

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
      orNotFound(await skillsService.update(user.id, params.id, body), "Skill not found"),
    { auth: true, params: skillParams, body: updateSkillBody },
  )
  .delete(
    "/:id",
    async ({ params, user }) => {
      if (!(await skillsService.remove(user.id, params.id))) {
        throw new NotFoundError("Skill not found");
      }
      return { ok: true };
    },
    { auth: true, params: skillParams },
  );
