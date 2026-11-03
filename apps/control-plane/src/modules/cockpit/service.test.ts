import { afterAll, describe, expect, test } from "bun:test";

import {
  createTagBody,
  createTaskBody,
  updateInboxBody,
  updateNoteBody,
  updateTagBody,
  updateTaskBody,
} from "./schema";

describe("cockpit schema", () => {
  test("tags are made lowercase and dashed, once each, and odd ones are refused", () => {
    const parsed = createTaskBody.parse({
      title: "Ship",
      tags: ["#Front End", "front-end", "Ops"],
    });
    expect(parsed.tags).toEqual(["front-end", "ops"]);
    expect(createTaskBody.safeParse({ title: "Ship", tags: ["no spaces?"] }).success).toBe(false);
    expect(createTaskBody.safeParse({ title: " " }).success).toBe(false);
    expect(updateTaskBody.safeParse({ status: "doing" }).success).toBe(false);
    expect(updateTaskBody.parse({ dueDate: "2026-11-30" })).toEqual({ dueDate: "2026-11-30" });
    // Eleven tags of which one is a repeat are ten.
    const eleven = [...Array.from({ length: 10 }, (_, i) => `t${i}`), "T0"];
    expect(createTaskBody.parse({ title: "x", tags: eleven }).tags).toHaveLength(10);
  });

  test("an update that changes nothing, or only fields there are not, is refused", () => {
    for (const schema of [updateInboxBody, updateTaskBody, updateNoteBody]) {
      expect(schema.safeParse({}).success).toBe(false);
      expect(schema.safeParse({ userId: "someone", number: 9 }).success).toBe(false);
    }
  });
});

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("cockpitService (postgres)", async () => {
  const { signUp } = await import("../../testing/sign-up");
  const { cockpitService } = await import("./service");
  const person = await signUp("Pilot");
  const other = await signUp("Other");
  afterAll(async () => {
    await person.remove();
    await other.remove();
  });

  test("inbox items are captured, marked done, changed and deleted", async () => {
    const item = await cockpitService.inbox.create(person.userId, {
      title: "Call the bank",
      tags: ["errand"],
    });
    expect(item).toMatchObject({ title: "Call the bank", tags: ["errand"], done: false });
    const done = await cockpitService.inbox.update(person.userId, item.id, { done: true });
    expect(done.done).toBe(true);
    expect((await cockpitService.inbox.list(person.userId)).map((i) => i.id)).toEqual([item.id]);
    await cockpitService.inbox.remove(person.userId, item.id);
    expect(await cockpitService.inbox.list(person.userId)).toEqual([]);
  });

  test("tasks are numbered per person and go to the top of their column", async () => {
    const one = await cockpitService.tasks.create(person.userId, { title: "One" });
    const two = await cockpitService.tasks.create(person.userId, {
      title: "Two",
      priority: "high",
    });
    const theirs = await cockpitService.tasks.create(other.userId, { title: "Theirs" });
    expect([one.number, two.number, theirs.number]).toEqual([1, 2, 1]);
    expect(one).toMatchObject({ status: "todo", priority: "none", dueDate: null });
    expect(two.position).toBeLessThan(one.position);
    const moved = await cockpitService.tasks.update(person.userId, one.id, {
      status: "in_progress",
      position: 5,
      dueDate: "2026-12-01",
    });
    expect(moved).toMatchObject({ status: "in_progress", position: 5, dueDate: "2026-12-01" });
  });

  test("notes are kept with pinned ones first", async () => {
    const plain = await cockpitService.notes.create(person.userId, { title: "Plain", body: "x" });
    const pinned = await cockpitService.notes.create(person.userId, {
      title: "Pinned",
      pinned: true,
      tags: ["ops"],
    });
    expect((await cockpitService.notes.list(person.userId)).map((n) => n.id)).toEqual([
      pinned.id,
      plain.id,
    ]);
  });

  test("tags count each kind, and another person's items cannot be reached", async () => {
    await cockpitService.tasks.create(person.userId, { title: "Tagged", tags: ["ops"] });
    const tags = await cockpitService.tags(person.userId);
    expect(tags.find((tag) => tag.name === "ops")).toEqual({
      name: "ops",
      color: null,
      inbox: 0,
      tasks: 1,
      notes: 1,
    });
    const [mine] = await cockpitService.tasks.list(person.userId);
    await expect(
      cockpitService.tasks.update(other.userId, mine!.id, { title: "Taken" }),
    ).rejects.toThrow("Task not found");
    await expect(cockpitService.tasks.remove(other.userId, mine!.id)).rejects.toThrow(
      "Task not found",
    );
    expect(await cockpitService.tags(other.userId)).toEqual([]);
  });

  test("another person's inbox items and notes cannot be changed or deleted", async () => {
    const item = await cockpitService.inbox.create(person.userId, { title: "Mine" });
    const note = await cockpitService.notes.create(person.userId, { title: "Mine" });
    await expect(
      cockpitService.inbox.update(other.userId, item.id, { title: "Taken" }),
    ).rejects.toThrow("Inbox item not found");
    await expect(cockpitService.inbox.remove(other.userId, item.id)).rejects.toThrow(
      "Inbox item not found",
    );
    await expect(
      cockpitService.notes.update(other.userId, note.id, { title: "Taken" }),
    ).rejects.toThrow("Note not found");
    await expect(cockpitService.notes.remove(other.userId, note.id)).rejects.toThrow(
      "Note not found",
    );
    expect(await cockpitService.inbox.list(other.userId)).toEqual([]);
    expect(await cockpitService.notes.list(other.userId)).toEqual([]);
  });

  test("a tag is added before use, colored, and its color given back; another's is not touched", async () => {
    const added = await cockpitService.addTag(person.userId, { name: "later-on" });
    expect(added).toMatchObject({ name: "later-on", color: null, inbox: 0, tasks: 0, notes: 0 });
    await expect(cockpitService.addTag(person.userId, { name: "later-on" })).rejects.toThrow(
      "already",
    );
    // A tag in use, with no row yet, takes a color too.
    await cockpitService.notes.create(person.userId, { title: "Tagged", tags: ["used"] });
    expect(await cockpitService.colorTag(person.userId, "used", "#00a84f")).toMatchObject({
      color: "#00a84f",
      notes: 1,
    });
    await cockpitService.colorTag(person.userId, "used", null);
    const tags = await cockpitService.tags(person.userId);
    expect(tags.find((tag) => tag.name === "used")?.color).toBeNull();
    expect(tags.some((tag) => tag.name === "later-on")).toBe(true);
    await expect(cockpitService.colorTag(other.userId, "used", "#000000")).rejects.toThrow(
      "Tag not found",
    );
    expect(updateTagBody.safeParse({ color: "red" }).success).toBe(false);
    expect(createTagBody.parse({ name: "#Big Idea", color: "#FF6EB4" })).toEqual({
      name: "big-idea",
      color: "#ff6eb4",
    });
  });

  test("many tags added at once neither hang nor repeat, and a reset color frees its row", async () => {
    const names = Array.from({ length: 14 }, (_, index) => `many-${index % 7}`);
    const outcomes = await Promise.allSettled(
      names.map((name) => cockpitService.addTag(person.userId, { name })),
    );
    expect(outcomes.filter((each) => each.status === "fulfilled")).toHaveLength(7);
    // A tag in use, colored and given back its default, has no row left to count.
    await cockpitService.inbox.create(person.userId, { title: "Tagged", tags: ["in-use"] });
    await cockpitService.colorTag(person.userId, "in-use", "#00a84f");
    await cockpitService.colorTag(person.userId, "in-use", null);
    const { db } = await import("@aven/db/client");
    const { cockpitTags } = await import("@aven/db/schema/cockpit-tags");
    const { and, eq } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(cockpitTags)
      .where(and(eq(cockpitTags.userId, person.userId), eq(cockpitTags.name, "in-use")));
    expect(rows).toEqual([]);
    await expect(cockpitService.addTag(person.userId, { name: "in-use" })).rejects.toThrow(
      "already",
    );
  }, 20_000);
});
