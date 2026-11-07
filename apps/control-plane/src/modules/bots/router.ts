import { Elysia, sse, status } from "elysia";

import { orNotFound } from "../../errors";
import { authRouter } from "../auth/router";
import { botParams, sendBotMessageBody, updateBotBody } from "./schema";
import { botsService } from "./service";
import type { BotChats } from "./types";

export const botsRouter = (chats: BotChats) =>
  new Elysia({ prefix: "/bots" })
    .use(authRouter)
    .get("/", ({ user }) => botsService.list(user.id), { auth: true })
    .patch(
      "/:id",
      async ({ params, body, user }) =>
        orNotFound(await botsService.update(user.id, params.id, body), "Bot not found"),
      { auth: true, params: botParams, body: updateBotBody },
    )
    .get(
      "/working",
      async function* ({ user, request }) {
        for await (const working of chats.working(user.id, request.signal)) {
          yield working ? sse({ data: working }) : sse({ event: "ping", data: "" });
        }
      },
      { auth: true },
    )
    .post(
      "/:id/messages",
      async ({ params, body, user }) => {
        await chats.send(user.id, params.id, body.text, body.attachments);
        return status(202, { ok: true });
      },
      { auth: true, params: botParams, body: sendBotMessageBody },
    )
    .get(
      "/:id/events",
      async function* ({ params, user, request }) {
        for await (const event of chats.events(user.id, params.id, request.signal)) {
          yield event ? sse({ data: event }) : sse({ event: "ping", data: "" });
        }
      },
      { auth: true, params: botParams },
    );
