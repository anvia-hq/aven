import { db } from "@aven/db/client";
import { memoryEvents, type MemoryEventRow } from "@aven/db/schema/memory-events";
import { memoryNotes, type MemoryNoteRow } from "@aven/db/schema/memory-notes";
import {
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
import { and, asc, count, desc, eq, isNull, type SQL } from "drizzle-orm";

import { ConflictError, NotFoundError, UnprocessableError } from "../../errors";
import { botsService } from "../bots/service";
import { projectsService } from "../projects/service";

/**
 * Whose memory an agent works in (decision 0102): the person's, with the project of a thread's run
 * or the bot of a reply. It comes from the control plane's record of the run, never from a runner.
 */
export type MemoryOwner = { userId: string; projectId?: string; botId?: string };

/** One folder of a person's memory: a scope, and the project or bot it is for. */
export type MemoryPlace = {
  userId: string;
  scope: MemoryScope;
  projectId?: string;
  botId?: string;
};

/** Who changes a note, for the history. */
export type MemoryActor =
  | { source: "person" }
  | { source: "thread"; threadId: string }
  | { source: "bot"; botId: string };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The folders an owner has, in the order the agent is shown them. */
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

/** A note's name as the agent or the person wrote it, refused with why when it will not do. */
export function checkName(name: string) {
  if (!MEMORY_NOTE_NAME.test(name)) throw new UnprocessableError(MEMORY_NOTE_NAME_RULE);
  return name;
}

/** A note's body, refused when it is too long. */
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

// A note or a name held by another note in the same folder, for the unique constraint's error.
const isNameTaken = (error: unknown) =>
  (error as { code?: string; cause?: { code?: string } })?.code === "23505" ||
  (error as { cause?: { code?: string } })?.cause?.code === "23505";

function writeOnce(place: MemoryPlace, name: string, body: string, actor: MemoryActor) {
  return db.transaction(async (tx) => {
    const existing = await find(tx, place, name);
    if (existing) {
      await tx.update(memoryNotes).set({ body }).where(eq(memoryNotes.id, existing.id));
      await record(tx, place, actor, { name, action: "updated" });
      return { created: false };
    }
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

// The notes of a person's memory, and every change to them (decision 0102). What the agent may
// touch is `MemoryOwner`'s folders; what the person may is all of their own.
export const memoryService = {
  /** The notes of one folder, by name. */
  async notes(place: MemoryPlace) {
    return db.select().from(memoryNotes).where(inPlace(place)).orderBy(asc(memoryNotes.name));
  },

  /** What an agent's instructions list of its memory: each folder's notes, by name and description. */
  async folders(owner: MemoryOwner): Promise<MemoryFolder[]> {
    const places = placesOf(owner);
    return Promise.all(
      places.map(async (place) => ({
        scope: place.scope,
        notes: (await memoryService.notes(place)).map((row) => ({
          name: row.name,
          description: noteDescription(row.body),
        })),
      })),
    );
  },

  async read(place: MemoryPlace, name: string) {
    return find(db, place, name);
  },

  /** Writes a note, replacing one of that name; says whether it was new. */
  async write(
    place: MemoryPlace,
    name: string,
    body: string,
    actor: MemoryActor,
  ): Promise<{ created: boolean }> {
    checkName(name);
    checkBody(body);
    try {
      return await writeOnce(place, name, body, actor);
    } catch (error) {
      // Made meanwhile by another write: this one replaces it.
      if (isNameTaken(error)) return writeOnce(place, name, body, actor);
      throw error;
    }
  },

  /**
   * Changes a note's body with `edit`, which gets the body as it is and gives the new one or throws:
   * the note is held meanwhile, so two edits at once do not lose one.
   */
  async edit(place: MemoryPlace, name: string, edit: (body: string) => string, actor: MemoryActor) {
    return db.transaction(async (tx) => {
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

  /** Moves a note to another name or folder of the same person; false when there is none. */
  async rename(
    from: { place: MemoryPlace; name: string },
    to: { place: MemoryPlace; name: string },
    actor: MemoryActor,
  ) {
    checkName(to.name);
    try {
      return await db.transaction(async (tx) => {
        const row = await find(tx, from.place, from.name);
        if (!row) return false;
        if (await find(tx, to.place, to.name)) {
          throw new ConflictError(`There is a note called ${to.name} there already`);
        }
        const moved = from.place.scope !== to.place.scope;
        if (moved) await roomFor(tx, to.place);
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
    } catch (error) {
      if (isNameTaken(error))
        throw new ConflictError(`There is a note called ${to.name} there already`);
      throw error;
    }
  },

  // What the person sees and changes in Settings: every note of theirs, in every scope.

  async list(userId: string) {
    const rows = await db
      .select()
      .from(memoryNotes)
      .where(eq(memoryNotes.userId, userId))
      .orderBy(asc(memoryNotes.scope), asc(memoryNotes.name));
    return rows.map(noteView);
  },

  /** A folder the person names, checked to be theirs: a project they can see, a bot they own. */
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
    if (await find(db, place, input.name)) {
      throw new ConflictError(`There is a note called ${input.name} there already`);
    }
    await memoryService.write(place, input.name, input.body, { source: "person" });
    return noteView((await find(db, place, input.name))!);
  },

  async update(userId: string, id: string, changes: { name?: string; body?: string }) {
    const [row] = await db
      .select()
      .from(memoryNotes)
      .where(and(eq(memoryNotes.userId, userId), eq(memoryNotes.id, id)));
    if (!row) throw new NotFoundError("Note not found");
    const place = placeOf(row);
    const actor = { source: "person" } as const;
    if (changes.body !== undefined && changes.body !== row.body) {
      await memoryService.edit(place, row.name, () => changes.body!, actor);
    }
    if (changes.name !== undefined && changes.name !== row.name) {
      await memoryService.rename({ place, name: row.name }, { place, name: changes.name }, actor);
    }
    const [now] = await db.select().from(memoryNotes).where(eq(memoryNotes.id, id));
    return noteView(now!);
  },

  async removeById(userId: string, id: string) {
    const [row] = await db
      .select()
      .from(memoryNotes)
      .where(and(eq(memoryNotes.userId, userId), eq(memoryNotes.id, id)));
    if (!row) throw new NotFoundError("Note not found");
    await memoryService.remove(placeOf(row), row.name, { source: "person" });
  },

  /** The latest 100 changes to the person's memory. */
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
