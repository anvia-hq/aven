import { Elysia, sse, status } from "elysia";

import { authRouter } from "../auth/router";
import { RunBusyError, runsService } from "../runs/service";
import { createThreadBody, sendMessageBody, threadParams, updateThreadBody } from "./schema";
import { InvalidProjectPathError, threadsService } from "./service";

export const threadsRouter = new Elysia({ prefix: "/threads" })
  .use(authRouter)
  .get(
    "/",
    async ({ session }) => {
      const organizationId = session.activeOrganizationId;
      if (!organizationId) return status(400, "No active organization");
      const rows = await threadsService.list(organizationId);
      return rows.map((thread) => ({ ...thread, running: runsService.isRunning(thread.id) }));
    },
    { auth: true },
  )
  .get(
    "/paths",
    async ({ session }) => {
      const organizationId = session.activeOrganizationId;
      if (!organizationId) return status(400, "No active organization");
      return threadsService.recentPaths(organizationId);
    },
    { auth: true },
  )
  .post(
    "/",
    async ({ body, session, user }) => {
      const organizationId = session.activeOrganizationId;
      if (!organizationId) return status(400, "No active organization");
      try {
        return await threadsService.create(organizationId, user.id, body);
      } catch (error) {
        if (error instanceof InvalidProjectPathError) return status(422, error.message);
        throw error;
      }
    },
    { auth: true, body: createThreadBody },
  )
  .get(
    "/:id",
    async ({ params, session }) => {
      const organizationId = session.activeOrganizationId;
      if (!organizationId) return status(400, "No active organization");
      const thread = await threadsService.get(organizationId, params.id);
      if (!thread) return status(404, "Thread not found");
      return {
        ...thread,
        running: runsService.isRunning(thread.id),
        messages: await runsService.history(thread),
      };
    },
    { auth: true, params: threadParams },
  )
  .patch(
    "/:id",
    async ({ params, body, session }) => {
      const organizationId = session.activeOrganizationId;
      if (!organizationId) return status(400, "No active organization");
      return (
        (await threadsService.update(organizationId, params.id, body)) ??
        status(404, "Thread not found")
      );
    },
    { auth: true, params: threadParams, body: updateThreadBody },
  )
  .post(
    "/:id/messages",
    async ({ params, body, session, set }) => {
      const organizationId = session.activeOrganizationId;
      if (!organizationId) return status(400, "No active organization");
      const thread = await threadsService.get(organizationId, params.id);
      if (!thread) return status(404, "Thread not found");
      try {
        await runsService.start(thread, body.prompt);
      } catch (error) {
        if (error instanceof RunBusyError) return status(409, error.message);
        return status(503, error instanceof Error ? error.message : "Could not start the agent");
      }
      set.status = 202;
      return { ok: true };
    },
    { auth: true, params: threadParams, body: sendMessageBody },
  )
  .post(
    "/:id/cancel",
    async ({ params, session }) => {
      const organizationId = session.activeOrganizationId;
      if (!organizationId) return status(400, "No active organization");
      const thread = await threadsService.get(organizationId, params.id);
      if (!thread) return status(404, "Thread not found");
      return { cancelled: runsService.cancel(thread.id) };
    },
    { auth: true, params: threadParams },
  )
  // Server-sent events: a snapshot first, then live run events. Closing the connection never
  // affects a running agent.
  .get(
    "/:id/events",
    async function* ({ params, session, request }) {
      const organizationId = session.activeOrganizationId;
      const thread = organizationId ? await threadsService.get(organizationId, params.id) : null;
      if (!thread) return status(404, "Thread not found");
      for await (const event of runsService.events(thread, request.signal)) {
        yield event ? sse({ data: event }) : sse({ event: "ping", data: "" });
      }
    },
    { auth: true, params: threadParams },
  );
