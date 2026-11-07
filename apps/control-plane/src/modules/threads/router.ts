import { Elysia, sse, status } from "elysia";

import { orNotFound } from "../../errors";
import { threadAccess } from "./access";
import type { RunManager } from "../runs/service";
import {
  answerQuestionBody,
  compactBody,
  continueBody,
  createThreadBody,
  sendMessageBody,
  threadParams,
  updateThreadBody,
} from "./schema";
import type { ThreadContinuation } from "./continuation";
import type { ThreadMessages } from "./messages";
import type { PutAwayThread } from "./put-away";
import { threadsService } from "./service";

// The runs and messages are given: they are made with the rest of the app in `composition.ts`.
export const threadsRouter = (
  runs: RunManager,
  messages: ThreadMessages,
  putAway: PutAwayThread,
  continuation: ThreadContinuation,
) =>
  new Elysia({ prefix: "/threads" })
    .use(threadAccess)
    .get(
      "/",
      async ({ organizationId, user }) => {
        const rows = await threadsService.list({ organizationId, userId: user.id });
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
      async ({ params, organizationId, user }) => {
        const thread = await threadsService.readable(
          { organizationId, userId: user.id },
          params.id,
        );
        return {
          ...thread,
          running: runs.isRunning(thread.id),
          messages: await runs.history(thread),
        };
      },
      { thread: "read", params: threadParams },
    )
    .patch(
      "/:id",
      async ({ params, body, organizationId, user }) => {
        const thread = orNotFound(
          await threadsService.update({ organizationId, userId: user.id }, params.id, body),
          "Thread not found",
        );
        // Put away: its run stops and its sandbox is freed, the conversation and files staying
        // (decision 0118).
        if (body.state === "archived") putAway({ id: thread.id, runtimeId: thread.runtimeId });
        return thread;
      },
      { thread: "own", params: threadParams, body: updateThreadBody },
    )
    .post(
      "/:id/messages",
      async ({ params, body, organizationId, user }) => {
        const { steered } = await messages.send(organizationId, user.id, params.id, body);
        return status(202, { ok: true, steered });
      },
      { thread: "own", params: threadParams, body: sendMessageBody },
    )
    .post(
      "/:id/compact",
      async ({ params, body, organizationId, user }) => {
        await messages.compact(organizationId, user.id, params.id, body);
        return status(202, { ok: true });
      },
      { thread: "own", params: threadParams, body: compactBody },
    )
    .post(
      "/:id/continue",
      ({ params, body, organizationId, user }) => {
        const { runtimeId, ...selection } = body;
        return continuation.continueOn(
          { organizationId, userId: user.id },
          params.id,
          runtimeId,
          selection,
        );
      },
      { thread: "own", params: threadParams, body: continueBody },
    )
    .post(
      "/:id/answer",
      async ({ params, body, organizationId, user }) => {
        await messages.answer(organizationId, user.id, params.id, body);
        return status(202, { ok: true });
      },
      { thread: "own", params: threadParams, body: answerQuestionBody },
    )
    .post("/:id/cancel", ({ params }) => ({ cancelled: runs.cancel(params.id) }), {
      thread: "own",
      params: threadParams,
    })
    // Server-sent events: a snapshot first, then live run events. Closing the connection never
    // affects a running agent.
    .get(
      "/:id/events",
      async function* ({ params, organizationId, user, request }) {
        const thread = await threadsService.readable(
          { organizationId, userId: user.id },
          params.id,
        );
        for await (const event of runs.events(thread, request.signal)) {
          yield event ? sse({ data: event }) : sse({ event: "ping", data: "" });
        }
      },
      { thread: "read", params: threadParams },
    );
