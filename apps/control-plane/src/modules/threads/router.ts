import { Elysia, sse, status } from "elysia";

import { authRouter } from "../auth/router";
import { runsService } from "../runs/service";
import {
  answerQuestionBody,
  createThreadBody,
  sendMessageBody,
  threadParams,
  updateThreadBody,
} from "./schema";
import { threadMessages } from "./messages";
import { threadsService } from "./service";

export const threadsRouter = new Elysia({ prefix: "/threads" })
  .use(authRouter)
  .get(
    "/",
    async ({ organizationId }) => {
      const rows = await threadsService.list(organizationId);
      return rows.map((thread) => ({ ...thread, running: runsService.isRunning(thread.id) }));
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
        running: runsService.isRunning(thread.id),
        messages: await runsService.history(thread),
      };
    },
    { auth: true, org: true, params: threadParams },
  )
  .patch(
    "/:id",
    async ({ params, body, organizationId }) => {
      return (
        (await threadsService.update(organizationId, params.id, body)) ??
        status(404, "Thread not found")
      );
    },
    { auth: true, org: true, params: threadParams, body: updateThreadBody },
  )
  .post(
    "/:id/messages",
    async ({ params, body, organizationId, user }) => {
      await threadMessages.send(organizationId, user.id, params.id, body);
      return status(202, { ok: true });
    },
    { auth: true, org: true, params: threadParams, body: sendMessageBody },
  )
  .post(
    "/:id/answer",
    async ({ params, body, organizationId, user }) => {
      await threadMessages.answer(organizationId, user.id, params.id, body);
      return status(202, { ok: true });
    },
    { auth: true, org: true, params: threadParams, body: answerQuestionBody },
  )
  .post(
    "/:id/cancel",
    async ({ params, organizationId }) => {
      const thread = await threadsService.require(organizationId, params.id);
      return { cancelled: runsService.cancel(thread.id) };
    },
    { auth: true, org: true, params: threadParams },
  )
  // Server-sent events: a snapshot first, then live run events. Closing the connection never
  // affects a running agent.
  .get(
    "/:id/events",
    async function* ({ params, organizationId, request }) {
      const thread = await threadsService.get(organizationId, params.id);
      if (!thread) return status(404, "Thread not found");
      for await (const event of runsService.events(thread, request.signal)) {
        yield event ? sse({ data: event }) : sse({ event: "ping", data: "" });
      }
    },
    { auth: true, org: true, params: threadParams },
  );
