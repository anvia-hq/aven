import { Elysia } from "elysia";

import { authRouter } from "../auth/router";
import {
  createInboxBody,
  createNoteBody,
  createTagBody,
  createTaskBody,
  itemParams,
  tagParams,
  updateInboxBody,
  updateNoteBody,
  updateTagBody,
  updateTaskBody,
} from "./schema";
import { cockpitService } from "./service";

// A person's cockpit (decision 0104): theirs in every workspace, so no `org: true`.
export const cockpitRouter = new Elysia({ prefix: "/cockpit" })
  .use(authRouter)
  .get("/tags", ({ user }) => cockpitService.tags(user.id), { auth: true })
  .post(
    "/tags",
    async ({ user, body, set }) => {
      const tag = await cockpitService.addTag(user.id, body);
      set.status = 201;
      return tag;
    },
    { auth: true, body: createTagBody },
  )
  .patch(
    "/tags/:name",
    ({ user, params, body }) => cockpitService.colorTag(user.id, params.name, body.color),
    { auth: true, params: tagParams, body: updateTagBody },
  )
  .get("/inbox", ({ user }) => cockpitService.inbox.list(user.id), { auth: true })
  .post("/inbox", ({ user, body }) => cockpitService.inbox.create(user.id, body), {
    auth: true,
    body: createInboxBody,
  })
  .patch(
    "/inbox/:id",
    ({ user, params, body }) => cockpitService.inbox.update(user.id, params.id, body),
    { auth: true, params: itemParams, body: updateInboxBody },
  )
  .delete(
    "/inbox/:id",
    async ({ user, params, set }) => {
      await cockpitService.inbox.remove(user.id, params.id);
      set.status = 204;
    },
    { auth: true, params: itemParams },
  )
  .get("/tasks", ({ user }) => cockpitService.tasks.list(user.id), { auth: true })
  .post("/tasks", ({ user, body }) => cockpitService.tasks.create(user.id, body), {
    auth: true,
    body: createTaskBody,
  })
  .patch(
    "/tasks/:id",
    ({ user, params, body }) => cockpitService.tasks.update(user.id, params.id, body),
    { auth: true, params: itemParams, body: updateTaskBody },
  )
  .delete(
    "/tasks/:id",
    async ({ user, params, set }) => {
      await cockpitService.tasks.remove(user.id, params.id);
      set.status = 204;
    },
    { auth: true, params: itemParams },
  )
  .get("/notes", ({ user }) => cockpitService.notes.list(user.id), { auth: true })
  .post("/notes", ({ user, body }) => cockpitService.notes.create(user.id, body), {
    auth: true,
    body: createNoteBody,
  })
  .patch(
    "/notes/:id",
    ({ user, params, body }) => cockpitService.notes.update(user.id, params.id, body),
    { auth: true, params: itemParams, body: updateNoteBody },
  )
  .delete(
    "/notes/:id",
    async ({ user, params, set }) => {
      await cockpitService.notes.remove(user.id, params.id);
      set.status = 204;
    },
    { auth: true, params: itemParams },
  );
