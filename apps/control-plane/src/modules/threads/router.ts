import { Elysia, sse, status } from "elysia";

import { orNotFound } from "../../errors";
import { authRouter } from "../auth/router";
import type { RunManager } from "../runs/service";
import {
  answerQuestionBody,
  createThreadBody,
  sendMessageBody,
  threadParams,
  updateThreadBody,
} from "./schema";
import type { ThreadMessages } from "./messages";
import { threadsService } from "./service";

// The runs and messages are given: they are made with the rest of the app in `composition.ts`.
export const threadsRouter = (runs: RunManager, messages: ThreadMessages) =>
  new Elysia({ prefix: "/threads" })
    .use(authRouter)
    .get(
      "/",
      async ({ organizationId }) => {
        const rows = await threadsService.list(organizationId);
        return rows.map((thread) => ({ ...thread, running: runs.isRunning(thread.id) }));
      },
      { auth: true, org: true },
    )
    .post(
      "/",
      ({ body, organizationId, user }) => threadsService.create(organizationId, user.id, body),
      { auth: true, org: true, body: createThreadBody },
    )
    .get(
      "/:id",
      async ({ params, organizationId }) => {
        const thread = await threadsService.require(organizationId, params.id);
        return {
          ...thread,
          running: runs.isRunning(thread.id),
          messages: await runs.history(thread),
        };
      },
      { auth: true, org: true, params: threadParams },
    )
    .patch(
      "/:id",
      async ({ params, body, organizationId }) =>
        orNotFound(
          await threadsService.update(organizationId, params.id, body),
          "Thread not found",
        ),
      { auth: true, org: true, params: threadParams, body: updateThreadBody },
    )
    .post(
      "/:id/messages",
      async ({ params, body, organizationId, user }) => {
        await messages.send(organizationId, user.id, params.id, body);
        return status(202, { ok: true });
      },
      { auth: true, org: true, params: threadParams, body: sendMessageBody },
    )
    .post(
      "/:id/answer",
      async ({ params, body, organizationId, user }) => {
        await messages.answer(organizationId, user.id, params.id, body);
        return status(202, { ok: true });
      },
      { auth: true, org: true, params: threadParams, body: answerQuestionBody },
    )
    .post(
      "/:id/cancel",
      async ({ params, organizationId }) => {
        const thread = await threadsService.require(organizationId, params.id);
        return { cancelled: runs.cancel(thread.id) };
      },
      { auth: true, org: true, params: threadParams },
    )
    // Server-sent events: a snapshot first, then live run events. Closing the connection never
    // affects a running agent.
    .get(
      "/:id/events",
      async function* ({ params, organizationId, request }) {
        const thread = await threadsService.require(organizationId, params.id);
        for await (const event of runs.events(thread, request.signal)) {
          yield event ? sse({ data: event }) : sse({ event: "ping", data: "" });
        }
      },
      { auth: true, org: true, params: threadParams },
    );
