import { Elysia, sse, status } from "elysia";

import { authRouter } from "../auth/router";
import { providersService } from "../providers/service";
import { runsService } from "../runs/service";
import { createThreadBody, sendMessageBody, threadParams, updateThreadBody } from "./schema";
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
      const thread = await threadsService.require(organizationId, params.id);
      const { prompt, ...selection } = body;
      // The sender's own provider; null falls back to the environment's shared one.
      const model = await providersService.resolveModel(user.id, selection);
      await runsService.start(thread, prompt, { userId: user.id, model, selection });
      return status(202, { ok: true });
    },
    { auth: true, org: true, params: threadParams, body: sendMessageBody },
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
