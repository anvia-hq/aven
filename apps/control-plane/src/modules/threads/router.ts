import { Elysia, sse, status } from "elysia";

import { orNotFound } from "@aven/server-kit/errors";
import { threadAccess } from "./access";
import type { RunManager } from "../runs/service";
import {
  answerQuestionBody,
  compactBody,
  continueBody,
  createThreadBody,
  messagesBeforeQuery,
  sendMessageBody,
  threadParams,
  updateThreadBody,
} from "./schema";
import { threadMentionsService } from "./mentions";
import { threadsService } from "./service";
import type { PutAwayThread, ThreadContinuation, ThreadMessages } from "./types";

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
    .get(
      "/mentioned",
      ({ organizationId, user }) => threadMentionsService.waiting(organizationId, user.id),
      { auth: true, org: true },
    )
    .get(
      "/mentions",
      ({ organizationId, user }) => threadMentionsService.list(organizationId, user.id),
      {
        auth: true,
        org: true,
      },
    )
    .post(
      "/mentions/read",
      async ({ organizationId, user }) => {
        await threadMentionsService.seenAll(organizationId, user.id);
        return { ok: true };
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
        const shown = await runs.latest(thread);
        return {
          ...thread,
          running: runs.isRunning(thread.id),
          messages: shown.messages,
          hidden: shown.hidden,
        };
      },
      { thread: "read", params: threadParams },
    )
    .get(
      "/:id/messages",
      async ({ params, query, organizationId, user }) => {
        const thread = await threadsService.readable(
          { organizationId, userId: user.id },
          params.id,
        );
        return runs.before(thread, query.before);
      },
      { thread: "read", params: threadParams, query: messagesBeforeQuery },
    )
    .patch(
      "/:id",
      async ({ params, body, organizationId, user }) => {
        const thread = orNotFound(
          await threadsService.update({ organizationId, userId: user.id }, params.id, body),
          "Thread not found",
        );

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
      { thread: "drive", params: threadParams, body: sendMessageBody },
    )
    .post(
      "/:id/mentions/seen",
      async ({ params, user }) => {
        await threadMentionsService.seen(user.id, params.id);
        return { ok: true };
      },
      { thread: "read", params: threadParams },
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
      { thread: "drive", params: threadParams, body: answerQuestionBody },
    )
    .post("/:id/cancel", ({ params }) => ({ cancelled: runs.cancel(params.id) }), {
      thread: "drive",
      params: threadParams,
    })
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
