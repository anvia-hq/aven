import { afterAll, describe, expect, test } from "bun:test";

import { threadCockpit } from "./commands";

test("a thread's agent reads, and nothing it does is the person's word", () => {
  expect(threadCockpit("u1", { title: "Fix the release" })).toEqual({
    userId: "u1",
    access: "read",
    onPersonsWord: false,
    actor: { kind: "thread", name: "Fix the release" },
  });
});

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("runCockpitCommand (postgres)", async () => {
  const { signUp } = await import("../../testing/sign-up");
  const { runCockpitCommand } = await import("./commands");
  const { cockpitService } = await import("./service");
  const person = await signUp("Pilot");
  const other = await signUp("Other");
  afterAll(async () => {
    await person.remove();
    await other.remove();
  });
  const bot = { userId: person.userId, access: "write" as const, onPersonsWord: false };
  const thread = { userId: person.userId, access: "read" as const, onPersonsWord: false };

  test("a bot writes markdown, which is kept and read back as it was written", async () => {
    const body = "# Plan\n\n- [ ] Draft\n- [x] Outline\n\n| a | b |\n| --- | --- |\n| 1 | 2 |";
    const made = await runCockpitCommand(bot, {
      command: "create",
      kind: "notes",
      fields: { title: "Launch", body, tags: ["Work"], pinned: true },
    });
    expect(made).toStartWith("Created Launch (id ");
    const [note] = await cockpitService.notes.list(person.userId);
    expect(note).toMatchObject({ body, tags: ["work"], pinned: true });
    const shown = await runCockpitCommand(thread, { command: "get", kind: "notes", id: note!.id });
    expect(shown).toContain("pinned: true");
    expect(shown).toEndWith(body);
  });

  test("a body the person wrote in the editor is read as markdown", async () => {
    const blocks = [
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Steps", styles: {} }],
        children: [],
      },
      {
        type: "checkListItem",
        props: { checked: true },
        content: [{ type: "text", text: "Done", styles: { bold: true } }],
        children: [],
      },
      {
        type: "paragraph",
        props: {},
        content: [
          {
            type: "link",
            href: "https://aven.dev",
            content: [{ type: "text", text: "site", styles: {} }],
          },
        ],
        children: [],
      },
    ];
    const item = await cockpitService.inbox.create(person.userId, {
      title: "Written by hand",
      body: JSON.stringify(blocks),
    });
    const shown = await runCockpitCommand(thread, { command: "get", kind: "inbox", id: item.id });
    expect(shown).toEndWith("## Steps\n\n- [x] **Done**\n\n[site](https://aven.dev)");
  });

  test("a task is found by its key, moved, listed and filtered", async () => {
    await runCockpitCommand(bot, {
      command: "create",
      kind: "tasks",
      fields: { title: "Ship it", body: "Check **CI**", priority: "high", dueDate: "2026-12-01" },
    });
    const [task] = await cockpitService.tasks.list(person.userId);
    const key = `T-${task!.number}`;
    expect(task!.description).toBe("Check **CI**");
    expect(
      await runCockpitCommand(bot, {
        command: "update",
        kind: "tasks",
        id: key.toLowerCase(),
        fields: { status: "in_progress" },
      }),
    ).toBe(`Updated ${key} Ship it.`);
    const listed = await runCockpitCommand(thread, {
      command: "list",
      kind: "tasks",
      status: "in_progress",
    });
    expect(listed).toContain(`${key} · Ship it · in_progress · priority high · due 2026-12-01`);
    expect(listed).toContain("Check CI");
    expect(
      await runCockpitCommand(thread, { command: "list", kind: "tasks", status: "done" }),
    ).toBe("No tasks records match.");
  });

  test("a thread's agent only reads, a bot deletes only on the person's word, and fields are checked", async () => {
    await expect(
      runCockpitCommand(thread, { command: "create", kind: "inbox", fields: { title: "No" } }),
    ).rejects.toThrow("only read");
    const item = await cockpitService.inbox.create(person.userId, { title: "Keep" });
    await expect(
      runCockpitCommand(bot, { command: "delete", kind: "inbox", id: item.id }),
    ).rejects.toThrow("when the person asks");
    expect(
      await runCockpitCommand(
        { ...bot, onPersonsWord: true },
        { command: "delete", kind: "inbox", id: item.id },
      ),
    ).toBe("Deleted Keep.");
    await expect(
      runCockpitCommand(bot, {
        command: "create",
        kind: "inbox",
        fields: { title: "x", priority: "high" },
      }),
    ).rejects.toThrow("inbox has no priority");
    await expect(
      runCockpitCommand(bot, { command: "create", kind: "notes", fields: { title: " " } }),
    ).rejects.toThrow("Give it a title");
    await expect(runCockpitCommand(bot, { command: "drop" })).rejects.toThrow();
  });

  test("a bot converts an inbox item into a task that keeps its body, and the item is marked done", async () => {
    const blocks = JSON.stringify([
      {
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "Call the bank", styles: { bold: true } }],
        children: [],
      },
    ]);
    const item = await cockpitService.inbox.create(person.userId, {
      title: "Sort the loan",
      body: blocks,
      tags: ["money"],
    });

    const converted = await runCockpitCommand(bot, {
      command: "convert",
      id: item.id,
      fields: { priority: "high", status: "todo", dueDate: "2026-12-01" },
    });
    expect(converted).toStartWith("Converted Sort the loan into T-");
    const task = (await cockpitService.tasks.list(person.userId)).find(
      (each) => each.title === "Sort the loan",
    );
    expect(task).toMatchObject({
      description: blocks,
      tags: ["money"],
      priority: "high",
      status: "todo",
      dueDate: "2026-12-01",
    });
    const after = (await cockpitService.inbox.list(person.userId)).find(
      (each) => each.id === item.id,
    );
    expect(after?.done).toBe(true);

    await expect(runCockpitCommand(bot, { command: "convert", id: item.id })).rejects.toThrow(
      "already done",
    );
    await expect(runCockpitCommand(thread, { command: "convert", id: item.id })).rejects.toThrow(
      "only read",
    );
    await expect(runCockpitCommand(bot, { command: "convert", id: "nope" })).rejects.toThrow(
      "There is no inbox record",
    );
  });

  test("a converted item takes the title, tags and markdown body the bot gives instead", async () => {
    const item = await cockpitService.inbox.create(person.userId, { title: "Vague", tags: ["a"] });
    await runCockpitCommand(bot, {
      command: "convert",
      id: item.id,
      fields: { title: "Renew the passport", tags: ["Admin"], body: "- [ ] photos" },
    });
    const task = (await cockpitService.tasks.list(person.userId)).find(
      (each) => each.title === "Renew the passport",
    );
    expect(task).toMatchObject({ tags: ["admin"], description: "- [ ] photos" });
  });

  test("another person's records are not there", async () => {
    const [note] = await cockpitService.notes.list(person.userId);
    const theirs = { userId: other.userId, access: "write" as const, onPersonsWord: true };
    await expect(
      runCockpitCommand(theirs, { command: "get", kind: "notes", id: note!.id }),
    ).rejects.toThrow("There is no notes record");
    expect(await runCockpitCommand(theirs, { command: "list", kind: "notes" })).toBe(
      "No notes records match.",
    );
  });

  test("a tag filter is normalized as tags are, a filter the kind lacks is refused, and a bot rewrites a record on any reply", async () => {
    await runCockpitCommand(bot, {
      command: "create",
      kind: "notes",
      fields: { title: "Tagged", tags: ["My Tag", "#Work"] },
    });
    for (const tag of ["My Tag", "#work"]) {
      expect(await runCockpitCommand(thread, { command: "list", kind: "notes", tag })).toContain(
        "Tagged",
      );
    }
    await expect(
      runCockpitCommand(thread, { command: "list", kind: "inbox", status: "todo" }),
    ).rejects.toThrow("Only tasks have a status");
    const [note] = (await cockpitService.notes.list(person.userId)).filter(
      (each) => each.title === "Tagged",
    );
    expect(
      await runCockpitCommand(bot, {
        command: "update",
        kind: "notes",
        id: note!.id,
        fields: { body: "Rewritten" },
      }),
    ).toBe("Updated Tagged.");
    expect(
      await runCockpitCommand(bot, {
        command: "update",
        kind: "notes",
        id: note!.id,
        fields: { pinned: true, tags: ["work"] },
      }),
    ).toBe("Updated Tagged.");
    expect(
      await runCockpitCommand(
        { ...bot, onPersonsWord: true },
        { command: "update", kind: "notes", id: note!.id, fields: { title: "Retitled" } },
      ),
    ).toBe("Updated Retitled.");
  });
});
