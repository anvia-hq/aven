import { db } from "@aven/db/client";
import { memoryEvents, type MemoryEventRow } from "@aven/db/schema/memory-events";
import { memoryNotes, type MemoryNoteRow } from "@aven/db/schema/memory-notes";
import {
  MEMORY_INDEXED_PER_SCOPE,
  MEMORY_NOTE_MAX,
  MEMORY_NOTE_NAME,
  MEMORY_NOTE_NAME_RULE,
  MEMORY_NOTES_PER_SCOPE,
  noteDescription,
  type MemoryEventView,
  type MemoryFolder,
  type MemoryNoteView,
  type MemoryScope,
} from "@aven/protocol/memory";
import { projects } from "@aven/db/schema/projects";
import { and, asc, count, desc, eq, isNull, sql, type SQL } from "drizzle-orm";

import { ConflictError, NotFoundError, UnprocessableError } from "../../errors";
import { botsService } from "../bots/service";
import { projectsService } from "../projects/service";
import type { MemoryActor, MemoryOwner, MemoryPlace } from "./types";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function placesOf(owner: MemoryOwner): MemoryPlace[] {
  const { userId, projectId, botId } = owner;
  const places: MemoryPlace[] = [];
  if (projectId) places.push({ userId, scope: "project", projectId });
  if (botId) places.push({ userId, scope: "bot", botId });
  places.push({ userId, scope: "personal" });
  return places;
}

const inPlace = (place: MemoryPlace): SQL =>
  and(
    eq(memoryNotes.userId, place.userId),
    eq(memoryNotes.scope, place.scope),
    place.projectId ? eq(memoryNotes.projectId, place.projectId) : isNull(memoryNotes.projectId),
    place.botId ? eq(memoryNotes.botId, place.botId) : isNull(memoryNotes.botId),
  )!;

const placeOf = (row: MemoryNoteRow): MemoryPlace => ({
  userId: row.userId,
  scope: row.scope,
  projectId: row.projectId ?? undefined,
  botId: row.botId ?? undefined,
});

export function checkName(name: string) {
  if (!MEMORY_NOTE_NAME.test(name)) throw new UnprocessableError(MEMORY_NOTE_NAME_RULE);
  return name;
}

export function checkBody(body: string) {
  if (body.length > MEMORY_NOTE_MAX) {
    throw new UnprocessableError(
      `A note holds at most ${MEMORY_NOTE_MAX} characters; this one has ${body.length}. Keep one fact a note.`,
    );
  }
  return body;
}

const noteView = (row: MemoryNoteRow): MemoryNoteView => ({
  id: row.id,
  scope: row.scope,
  projectId: row.projectId,
  botId: row.botId,
  name: row.name,
  description: noteDescription(row.body),
  body: row.body,
  updatedAt: row.updatedAt.toISOString(),
});

const eventView = (row: MemoryEventRow): MemoryEventView => ({
  id: row.id,
  scope: row.scope,
  projectId: row.projectId,
  botId: row.botId,
  name: row.name,
  action: row.action,
  from: row.from,
  source: row.source,
  threadId: row.threadId,
  at: row.createdAt.toISOString(),
});

async function record(
  tx: Tx,
  place: MemoryPlace,
  actor: MemoryActor,
  change: { name: string; action: MemoryEventRow["action"]; from?: string },
) {
  await tx.insert(memoryEvents).values({
    userId: place.userId,
    scope: place.scope,
    projectId: place.projectId ?? null,
    botId: place.botId ?? null,
    name: change.name,
    action: change.action,
    from: change.from ?? null,
    source: actor.source,
    threadId: actor.source === "thread" ? actor.threadId : null,
    byBotId: actor.source === "bot" ? actor.botId : null,
  });
}

async function find(tx: Tx | typeof db, place: MemoryPlace, name: string) {
  const [row] = await tx
    .select()
    .from(memoryNotes)
    .where(and(inPlace(place), eq(memoryNotes.name, name)));
  return row;
}

async function roomFor(tx: Tx, place: MemoryPlace) {
  const [counted] = await tx.select({ n: count() }).from(memoryNotes).where(inPlace(place));
  if ((counted?.n ?? 0) >= MEMORY_NOTES_PER_SCOPE) {
    throw new UnprocessableError(
      `This folder holds ${MEMORY_NOTES_PER_SCOPE} notes already. Fold some together or delete ones that are no longer true.`,
    );
  }
}

async function lockFolder(tx: Tx, ...places: MemoryPlace[]) {
  const keys = places.map((place) =>
    [place.userId, place.scope, place.projectId ?? "", place.botId ?? ""].join("|"),
  );
  for (const key of [...new Set(keys)].sort()) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
  }
}

async function requireLiveProject(tx: Tx, place: MemoryPlace) {
  if (place.scope !== "project" || !place.projectId) return;
  const [project] = await tx
    .select({ deletedAt: projects.deletedAt })
    .from(projects)
    .where(eq(projects.id, place.projectId))
    .for("share");
  if (!project || project.deletedAt) throw new UnprocessableError("This project was deleted.");
}

const nameTaken = (name: string) =>
  new ConflictError(`There is a note called ${name} there already`);

function writeOnce(
  place: MemoryPlace,
  name: string,
  body: string,
  actor: MemoryActor,
  onlyNew: boolean,
) {
  return db.transaction(async (tx) => {
    await lockFolder(tx, place);
    const existing = await find(tx, place, name);
    if (existing && onlyNew) throw nameTaken(name);
    if (existing) {
      await tx.update(memoryNotes).set({ body }).where(eq(memoryNotes.id, existing.id));
      await record(tx, place, actor, { name, action: "updated" });
      return { created: false };
    }
    await requireLiveProject(tx, place);
    await roomFor(tx, place);
    await tx.insert(memoryNotes).values({
      userId: place.userId,
      scope: place.scope,
      projectId: place.projectId ?? null,
      botId: place.botId ?? null,
      name,
      body,
    });
    await record(tx, place, actor, { name, action: "created" });
    return { created: true };
  });
}

export const memoryService = {
  async notes(place: MemoryPlace) {
    return db.select().from(memoryNotes).where(inPlace(place)).orderBy(asc(memoryNotes.name));
  },

  async folders(owner: MemoryOwner): Promise<MemoryFolder[]> {
    const places = placesOf(owner);
    return Promise.all(
      places.map(async (place) => {
        const rows = await db
          .select()
          .from(memoryNotes)
          .where(inPlace(place))
          .orderBy(desc(memoryNotes.updatedAt))
          .limit(MEMORY_INDEXED_PER_SCOPE + 1);
        const [counted] =
          rows.length > MEMORY_INDEXED_PER_SCOPE
            ? await db.select({ n: count() }).from(memoryNotes).where(inPlace(place))
            : [{ n: rows.length }];
        const listed = rows.slice(0, MEMORY_INDEXED_PER_SCOPE);
        return {
          scope: place.scope,
          notes: listed
            .map((row) => ({ name: row.name, description: noteDescription(row.body) }))
            .sort((a, b) => a.name.localeCompare(b.name)),
          more: (counted?.n ?? 0) - listed.length,
        };
      }),
    );
  },

  async read(place: MemoryPlace, name: string) {
    return find(db, place, name);
  },

  async write(
    place: MemoryPlace,
    name: string,
    body: string,
    actor: MemoryActor,
  ): Promise<{ created: boolean }> {
    checkName(name);
    checkBody(body);
    return writeOnce(place, name, body, actor, false);
  },

  async edit(place: MemoryPlace, name: string, edit: (body: string) => string, actor: MemoryActor) {
    return db.transaction(async (tx) => {
      await lockFolder(tx, place);
      const [row] = await tx
        .select()
        .from(memoryNotes)
        .where(and(inPlace(place), eq(memoryNotes.name, name)))
        .for("update");
      if (!row) return false;
      const body = checkBody(edit(row.body));
      await tx.update(memoryNotes).set({ body }).where(eq(memoryNotes.id, row.id));
      await record(tx, place, actor, { name, action: "updated" });
      return true;
    });
  },

  async remove(place: MemoryPlace, name: string, actor: MemoryActor) {
    return db.transaction(async (tx) => {
      const [gone] = await tx
        .delete(memoryNotes)
        .where(and(inPlace(place), eq(memoryNotes.name, name)))
        .returning({ id: memoryNotes.id });
      if (gone) await record(tx, place, actor, { name, action: "removed" });
      return Boolean(gone);
    });
  },

  async rename(
    from: { place: MemoryPlace; name: string },
    to: { place: MemoryPlace; name: string },
    actor: MemoryActor,
  ) {
    checkName(to.name);
    return db.transaction(async (tx) => {
      await lockFolder(tx, from.place, to.place);
      const row = await find(tx, from.place, from.name);
      if (!row) return false;
      if (await find(tx, to.place, to.name)) throw nameTaken(to.name);
      const moved = from.place.scope !== to.place.scope;
      if (moved) {
        await requireLiveProject(tx, to.place);
        await roomFor(tx, to.place);
      }
      await tx
        .update(memoryNotes)
        .set({
          scope: to.place.scope,
          projectId: to.place.projectId ?? null,
          botId: to.place.botId ?? null,
          name: to.name,
        })
        .where(eq(memoryNotes.id, row.id));
      if (moved) {
        await record(tx, from.place, actor, { name: from.name, action: "removed" });
        await record(tx, to.place, actor, { name: to.name, action: "created" });
      } else {
        await record(tx, to.place, actor, {
          name: to.name,
          action: "renamed",
          from: from.name,
        });
      }
      return true;
    });
  },

  async list(userId: string) {
    const rows = await db
      .select()
      .from(memoryNotes)
      .where(eq(memoryNotes.userId, userId))
      .orderBy(asc(memoryNotes.scope), asc(memoryNotes.name));
    return rows.map(noteView);
  },

  async placeFor(
    userId: string,
    input: { scope: MemoryScope; projectId?: string; botId?: string },
  ): Promise<MemoryPlace> {
    if (input.scope === "personal") return { userId, scope: "personal" };
    if (input.scope === "project") {
      const project = input.projectId
        ? (await projectsService.listForPerson(userId)).find((p) => p.id === input.projectId)
        : undefined;
      if (!project) throw new NotFoundError("Project not found");
      return { userId, scope: "project", projectId: project.id };
    }
    const bot = input.botId ? await botsService.get(userId, input.botId) : null;
    if (!bot) throw new NotFoundError("Bot not found");
    return { userId, scope: "bot", botId: bot.id };
  },

  async create(
    userId: string,
    input: { scope: MemoryScope; projectId?: string; botId?: string; name: string; body: string },
  ) {
    const place = await memoryService.placeFor(userId, input);
    checkName(input.name);
    checkBody(input.body);
    await writeOnce(place, input.name, input.body, { source: "person" }, true);
    return noteView((await find(db, place, input.name))!);
  },

  async update(userId: string, id: string, changes: { name?: string; body?: string }) {
    if (changes.name !== undefined) checkName(changes.name);
    if (changes.body !== undefined) checkBody(changes.body);
    const ofPerson = and(eq(memoryNotes.userId, userId), eq(memoryNotes.id, id));
    const updated = await db.transaction(async (tx) => {
      const [found] = await tx.select().from(memoryNotes).where(ofPerson);
      if (!found) throw new NotFoundError("Note not found");
      await lockFolder(tx, placeOf(found));
      const [row] = await tx.select().from(memoryNotes).where(ofPerson).for("update");
      if (!row) throw new NotFoundError("Note not found");
      const place = placeOf(row);
      const actor = { source: "person" } as const;
      const name = changes.name ?? row.name;
      const body = changes.body ?? row.body;
      if (name !== row.name && (await find(tx, place, name))) throw nameTaken(name);
      const [now] = await tx
        .update(memoryNotes)
        .set({ name, body })
        .where(eq(memoryNotes.id, row.id))
        .returning();
      if (body !== row.body) await record(tx, place, actor, { name: row.name, action: "updated" });
      if (name !== row.name) {
        await record(tx, place, actor, { name, action: "renamed", from: row.name });
      }
      return now!;
    });
    return noteView(updated);
  },

  async removeById(userId: string, id: string) {
    const [row] = await db
      .select()
      .from(memoryNotes)
      .where(and(eq(memoryNotes.userId, userId), eq(memoryNotes.id, id)));
    if (!row) throw new NotFoundError("Note not found");
    await memoryService.remove(placeOf(row), row.name, { source: "person" });
  },

  async history(userId: string) {
    const rows = await db
      .select()
      .from(memoryEvents)
      .where(eq(memoryEvents.userId, userId))
      .orderBy(desc(memoryEvents.createdAt))
      .limit(100);
    return rows.map(eventView);
  },
};
