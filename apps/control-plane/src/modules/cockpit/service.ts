import { db } from "@aven/db/client";
import { cockpitInboxItems, type CockpitInboxItemRow } from "@aven/db/schema/cockpit-inbox-items";
import { cockpitNotes, type CockpitNoteRow } from "@aven/db/schema/cockpit-notes";
import { cockpitTags } from "@aven/db/schema/cockpit-tags";
import { cockpitTasks, type CockpitTaskRow } from "@aven/db/schema/cockpit-tasks";
import {
  COCKPIT_ITEMS_MAX,
  TAGS_DEFINED_MAX,
  type CockpitNote,
  type CockpitTag,
  type CockpitTask,
  type InboxItem,
} from "@aven/protocol/cockpit";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";

import { ConflictError, NotFoundError, UnprocessableError } from "../../errors";
import type {
  CreateInboxBody,
  CreateNoteBody,
  CreateTaskBody,
  UpdateInboxBody,
  UpdateNoteBody,
  UpdateTaskBody,
} from "./schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const iso = (date: Date) => date.toISOString();

const inboxView = (row: CockpitInboxItemRow): InboxItem => ({
  id: row.id,
  title: row.title,
  body: row.body,
  tags: row.tags,
  done: row.done,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const taskView = (row: CockpitTaskRow): CockpitTask => ({
  id: row.id,
  number: row.number,
  title: row.title,
  description: row.description,
  status: row.status,
  priority: row.priority,
  dueDate: row.dueDate,
  tags: row.tags,
  position: row.position,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const noteView = (row: CockpitNoteRow): CockpitNote => ({
  id: row.id,
  title: row.title,
  body: row.body,
  tags: row.tags,
  pinned: row.pinned,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

// One person's writes of a kind at a time, so the count and a task's next number hold.
async function lockPerson(tx: Tx, userId: string, kind: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`cockpit|${kind}|${userId}`}))`);
}

async function roomFor(
  tx: Tx,
  table: typeof cockpitInboxItems | typeof cockpitTasks | typeof cockpitNotes,
  userId: string,
) {
  const [counted] = await tx.select({ n: count() }).from(table).where(eq(table.userId, userId));
  if ((counted?.n ?? 0) >= COCKPIT_ITEMS_MAX) {
    throw new UnprocessableError(`You can keep at most ${COCKPIT_ITEMS_MAX} of these`);
  }
}

const notFound = (what: string) => new NotFoundError(`${what} not found`);

// Whether any of the person's records carries a tag.
async function tagInUse(tx: Tx, userId: string, name: string) {
  for (const table of [cockpitInboxItems, cockpitTasks, cockpitNotes]) {
    const [row] = await tx
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.userId, userId), sql`${name} = any(${table.tags})`))
      .limit(1);
    if (row) return true;
  }
  return false;
}

// A person defines at most so many tags.
async function checkDefinedRoom(tx: Tx, userId: string) {
  const [row] = await tx
    .select({ n: count() })
    .from(cockpitTags)
    .where(eq(cockpitTags.userId, userId));
  if (Number(row?.n ?? 0) >= TAGS_DEFINED_MAX) {
    throw new UnprocessableError(`At most ${TAGS_DEFINED_MAX} tags`);
  }
}

// A person's cockpit (decision 0104): their inbox, tasks and notes, each theirs alone and found by
// id within what is theirs.
export const cockpitService = {
  inbox: {
    async list(userId: string) {
      const rows = await db
        .select()
        .from(cockpitInboxItems)
        .where(eq(cockpitInboxItems.userId, userId))
        .orderBy(desc(cockpitInboxItems.createdAt));
      return rows.map(inboxView);
    },
    async create(userId: string, input: CreateInboxBody) {
      const row = await db.transaction(async (tx) => {
        await lockPerson(tx, userId, "inbox");
        await roomFor(tx, cockpitInboxItems, userId);
        const [made] = await tx
          .insert(cockpitInboxItems)
          .values({ userId, title: input.title, body: input.body ?? "", tags: input.tags ?? [] })
          .returning();
        return made!;
      });
      return inboxView(row);
    },
    async update(userId: string, id: string, input: UpdateInboxBody) {
      const [row] = await db
        .update(cockpitInboxItems)
        .set(input)
        .where(and(eq(cockpitInboxItems.userId, userId), eq(cockpitInboxItems.id, id)))
        .returning();
      if (!row) throw notFound("Inbox item");
      return inboxView(row);
    },
    async remove(userId: string, id: string) {
      const [gone] = await db
        .delete(cockpitInboxItems)
        .where(and(eq(cockpitInboxItems.userId, userId), eq(cockpitInboxItems.id, id)))
        .returning({ id: cockpitInboxItems.id });
      if (!gone) throw notFound("Inbox item");
    },
  },

  tasks: {
    async list(userId: string) {
      const rows = await db
        .select()
        .from(cockpitTasks)
        .where(eq(cockpitTasks.userId, userId))
        .orderBy(asc(cockpitTasks.position), desc(cockpitTasks.number));
      return rows.map(taskView);
    },
    // A new task takes the next number and goes to the top of its column.
    async create(userId: string, input: CreateTaskBody) {
      const status = input.status ?? "todo";
      const row = await db.transaction(async (tx) => {
        await lockPerson(tx, userId, "tasks");
        await roomFor(tx, cockpitTasks, userId);
        const [last] = await tx
          .select({
            number: sql<number>`coalesce(max(${cockpitTasks.number}), 0)`,
          })
          .from(cockpitTasks)
          .where(eq(cockpitTasks.userId, userId));
        const [top] = await tx
          .select({ position: sql<number | null>`min(${cockpitTasks.position})` })
          .from(cockpitTasks)
          .where(and(eq(cockpitTasks.userId, userId), eq(cockpitTasks.status, status)));
        const [made] = await tx
          .insert(cockpitTasks)
          .values({
            userId,
            number: Number(last?.number ?? 0) + 1,
            title: input.title,
            description: input.description ?? "",
            status,
            priority: input.priority ?? "none",
            dueDate: input.dueDate ?? null,
            tags: input.tags ?? [],
            position: top?.position == null ? 0 : Number(top.position) - 1,
          })
          .returning();
        return made!;
      });
      return taskView(row);
    },
    async update(userId: string, id: string, input: UpdateTaskBody) {
      const [row] = await db
        .update(cockpitTasks)
        .set(input)
        .where(and(eq(cockpitTasks.userId, userId), eq(cockpitTasks.id, id)))
        .returning();
      if (!row) throw notFound("Task");
      return taskView(row);
    },
    async remove(userId: string, id: string) {
      const [gone] = await db
        .delete(cockpitTasks)
        .where(and(eq(cockpitTasks.userId, userId), eq(cockpitTasks.id, id)))
        .returning({ id: cockpitTasks.id });
      if (!gone) throw notFound("Task");
    },
  },

  notes: {
    async list(userId: string) {
      const rows = await db
        .select()
        .from(cockpitNotes)
        .where(eq(cockpitNotes.userId, userId))
        .orderBy(desc(cockpitNotes.pinned), desc(cockpitNotes.updatedAt));
      return rows.map(noteView);
    },
    async create(userId: string, input: CreateNoteBody) {
      const row = await db.transaction(async (tx) => {
        await lockPerson(tx, userId, "notes");
        await roomFor(tx, cockpitNotes, userId);
        const [made] = await tx
          .insert(cockpitNotes)
          .values({
            userId,
            title: input.title,
            body: input.body ?? "",
            tags: input.tags ?? [],
            pinned: input.pinned ?? false,
          })
          .returning();
        return made!;
      });
      return noteView(row);
    },
    async update(userId: string, id: string, input: UpdateNoteBody) {
      const [row] = await db
        .update(cockpitNotes)
        .set(input)
        .where(and(eq(cockpitNotes.userId, userId), eq(cockpitNotes.id, id)))
        .returning();
      if (!row) throw notFound("Note");
      return noteView(row);
    },
    async remove(userId: string, id: string) {
      const [gone] = await db
        .delete(cockpitNotes)
        .where(and(eq(cockpitNotes.userId, userId), eq(cockpitNotes.id, id)))
        .returning({ id: cockpitNotes.id });
      if (!gone) throw notFound("Note");
    },
  },

  /**
   * Every tag the person uses or defined, with how many of each kind carry it and its color, most
   * used first.
   */
  async tags(userId: string): Promise<CockpitTag[]> {
    const counted = async (
      table: typeof cockpitInboxItems | typeof cockpitTasks | typeof cockpitNotes,
    ) => {
      const rows = await db
        .select({ name: sql<string>`unnest(${table.tags})`, n: count() })
        .from(table)
        .where(eq(table.userId, userId))
        .groupBy(sql`1`);
      return new Map(rows.map((row) => [row.name, Number(row.n)]));
    };
    const [inbox, tasks, notes, defined] = await Promise.all([
      counted(cockpitInboxItems),
      counted(cockpitTasks),
      counted(cockpitNotes),
      db
        .select({ name: cockpitTags.name, color: cockpitTags.color })
        .from(cockpitTags)
        .where(eq(cockpitTags.userId, userId)),
    ]);
    const colors = new Map(defined.map((row) => [row.name, row.color]));
    const names = new Set([...inbox.keys(), ...tasks.keys(), ...notes.keys(), ...colors.keys()]);
    return [...names]
      .map((name) => ({
        name,
        color: colors.get(name) ?? null,
        inbox: inbox.get(name) ?? 0,
        tasks: tasks.get(name) ?? 0,
        notes: notes.get(name) ?? 0,
      }))
      .sort(
        (a, b) =>
          b.inbox + b.tasks + b.notes - (a.inbox + a.tasks + a.notes) ||
          a.name.localeCompare(b.name),
      );
  },

  /** Adds a tag before anything carries it (decision 0107); one the person has already is refused. */
  async addTag(userId: string, input: { name: string; color?: string | null }) {
    await db.transaction(async (tx) => {
      await lockPerson(tx, userId, "tags");
      // Asked on the transaction's own connection: a request holding one while it waits for
      // another, as many at once would, can take every connection there is.
      const [defined] = await tx
        .select({ id: cockpitTags.id })
        .from(cockpitTags)
        .where(and(eq(cockpitTags.userId, userId), eq(cockpitTags.name, input.name)));
      if (defined || (await tagInUse(tx, userId, input.name))) {
        throw new ConflictError(`There is a tag ${input.name} already`);
      }
      await checkDefinedRoom(tx, userId);
      await tx.insert(cockpitTags).values({ userId, name: input.name, color: input.color ?? null });
    });
    return this.tag(userId, input.name);
  },

  /**
   * Sets a tag's color, or with null gives it back the one its name picks. A tag in use that goes
   * back to its default needs no row, so it stops counting toward the tags a person defines.
   */
  async colorTag(userId: string, name: string, color: string | null) {
    const tag = await this.tag(userId, name);
    await db.transaction(async (tx) => {
      await lockPerson(tx, userId, "tags");
      const [row] = await tx
        .select({ id: cockpitTags.id })
        .from(cockpitTags)
        .where(and(eq(cockpitTags.userId, userId), eq(cockpitTags.name, name)));
      if (row && color === null && (await tagInUse(tx, userId, name))) {
        await tx.delete(cockpitTags).where(eq(cockpitTags.id, row.id));
      } else if (row) {
        await tx.update(cockpitTags).set({ color }).where(eq(cockpitTags.id, row.id));
      } else if (color !== null) {
        await checkDefinedRoom(tx, userId);
        await tx.insert(cockpitTags).values({ userId, name, color });
      }
    });
    return { ...tag, color };
  },

  async tag(userId: string, name: string) {
    const tag = (await this.tags(userId)).find((each) => each.name === name);
    if (!tag) throw notFound("Tag");
    return tag;
  },
};
