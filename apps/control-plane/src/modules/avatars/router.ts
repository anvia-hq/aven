import { Elysia, status } from "elysia";
import { z } from "zod";

import { authRouter } from "../auth/router";
import { UnprocessableError } from "@aven/server-kit/errors";
import { AVATAR_MAX_BYTES, avatarsService, readCapped } from "./service";

export const avatarsRouter = new Elysia()
  .use(authRouter)
  .put(
    "/profile/avatar",
    async ({ request, user }) => {
      if (Number(request.headers.get("content-length") ?? 0) > AVATAR_MAX_BYTES) {
        throw new UnprocessableError("The image is too large: keep it under 256 KB");
      }

      const bytes = await readCapped(request);
      return avatarsService.save(user.id, bytes);
    },
    { auth: true, parse: "none" },
  )
  .delete("/profile/avatar", ({ user }) => avatarsService.remove(user.id), { auth: true })
  .get(
    "/users/:id/avatar",
    async ({ params, user }) => {
      const avatar = await avatarsService.read(user.id, params.id);

      if (!avatar) return status(404, "No avatar");

      return new Response(avatar.data as BodyInit, {
        headers: {
          "content-type": avatar.contentType,
          "cache-control": "private, max-age=31536000, immutable",
          "x-content-type-options": "nosniff",
        },
      });
    },
    { auth: true, params: z.object({ id: z.string().min(1).max(64) }) },
  );
