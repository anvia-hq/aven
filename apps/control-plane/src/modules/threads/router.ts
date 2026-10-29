import { Elysia, sse, status } from "elysia";

import { authRouter } from "../auth/router";
import { InvalidSelectionError, providersService } from "../providers/service";
import { RunBusyError, runsService } from "../runs/service";
import { createThreadBody, sendMessageBody, threadParams, updateThreadBody } from "./schema";
import { ProjectNotFoundError, threadsService } from "./service";

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
    async ({ body, organizationId, user }) => {
      try {
        return await threadsService.create(organizationId, user.id, body);
      } catch (error) {
        if (error instanceof ProjectNotFoundError) return status(422, error.message);
        throw error;
      }
    },
    { auth: true, org: true, body: createThreadBody },
  )
  .get(
    "/:id",
    async ({ params, organizationId }) => {
      const thread = await threadsService.get(organizationId, params.id);
      if (!thread) return status(404, "Thread not found");
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
    async ({ params, body, organizationId, user, set }) => {
      const thread = await threadsService.get(organizationId, params.id);
      if (!thread) return status(404, "Thread not found");
      const { prompt, ...selection } = body;
      try {
        // The sender's own provider; null falls back to the environment's shared one.
        const model = await providersService.resolveModel(user.id, selection);
        await runsService.start(thread, prompt, { userId: user.id, model, selection });
      } catch (error) {
        if (error instanceof InvalidSelectionError) return status(422, error.message);
        if (error instanceof RunBusyError) return status(409, error.message);
        return status(503, error instanceof Error ? error.message : "Could not start the agent");
      }
      set.status = 202;
      return { ok: true };
    },
    { auth: true, org: true, params: threadParams, body: sendMessageBody },
  )
  .post(
    "/:id/cancel",
    async ({ params, organizationId }) => {
      const thread = await threadsService.get(organizationId, params.id);
      if (!thread) return status(404, "Thread not found");
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
