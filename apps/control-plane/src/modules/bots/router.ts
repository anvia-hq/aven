import { Elysia, sse, status } from "elysia";

import { orNotFound } from "../../errors";
import { authRouter } from "../auth/router";
import type { BotChats } from "./chats";
import { botParams, sendBotMessageBody, updateBotBody } from "./schema";
import { botsService } from "./service";

// Bots belong to the signed-in user, not to the active organization, so no `org: true`.
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
    // The person says something; the bot's reply comes through the events.
    .post(
      "/:id/messages",
      async ({ params, body, user }) => {
        await chats.send(user.id, params.id, body.text);
        return status(202, { ok: true });
      },
      { auth: true, params: botParams, body: sendBotMessageBody },
    )
    // Server-sent events: the chat first, then live events. Closing the connection never stops a reply.
    .get(
      "/:id/events",
      async function* ({ params, user, request }) {
        for await (const event of chats.events(user.id, params.id, request.signal)) {
          yield event ? sse({ data: event }) : sse({ event: "ping", data: "" });
        }
      },
      { auth: true, params: botParams },
    );
