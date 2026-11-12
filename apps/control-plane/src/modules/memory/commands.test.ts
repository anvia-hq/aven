import { afterAll, describe, expect, test } from "bun:test";

import { noteDescription } from "@aven/protocol/memory";

import type { MemoryCaller } from "./types";

describe("noteDescription", () => {
  test("is the frontmatter's description, or else the first line of text", () => {
    expect(
      noteDescription(
        "---\nname: x\ndescription: Prefers small commits\ntype: feedback\n---\nBody",
      ),
    ).toBe("Prefers small commits");
    expect(noteDescription("# Staging is shared\n\nDo not reset it.")).toBe("Staging is shared");
    expect(noteDescription("a".repeat(300))).toHaveLength(200);
  });
});

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("runMemoryCommand (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { runtimesService } = await import("../runtimes/service");
  const { botsService } = await import("../bots/service");
  const { threadsService } = await import("../threads/service");
  const { memoryService } = await import("./service");
  const { runMemoryCommand } = await import("./commands");

  const { userId, orgA, cleanup } = await seedOrgPair();
  const runner = (await runtimesService.create(orgA, userId, { name: "m" })).runtime;
  const { project } = await seedProject(orgA, userId, runner.id, "remembered");
  const { project: other } = await seedProject(orgA, userId, runner.id, "elsewhere");
  const bot = await botsService.create(userId, { name: "Keeper", instruction: "x" });
  afterAll(cleanup);

  const thread = (await threadsService.create(orgA, userId, { projectId: project.id, title: "t" }))
    .id;
  const inProject = {
    owner: { userId, projectId: project.id },
    actor: { source: "thread" as const, threadId: thread },
    writable: true,
  };
  const caller: MemoryCaller = { ...inProject, actor: { source: "person" } };
  const ask = (command: Parameters<typeof runMemoryCommand>[1], as: MemoryCaller = caller) =>
    runMemoryCommand(as, command);

  test("a note is saved, listed, read with numbered lines, edited and deleted", async () => {
    const path = "/memories/project/staging.md";
    expect(
      await ask({
        command: "create",
        path,
        fileText: "---\ndescription: Staging is shared\n---\nNever reset it.",
      }),
    ).toBe(`Saved ${path}.`);
    expect(await ask({ command: "view", path: "/memories/project" })).toBe(
      "/memories/project:\n- staging.md: Staging is shared",
    );
    expect(await ask({ command: "view", path })).toContain("     4\tNever reset it.");
    await ask({ command: "str_replace", path, oldStr: "Never", newStr: "Do not ever" });
    await ask({ command: "insert", path, insertLine: 4, insertText: "Ask first." });
    expect(await ask({ command: "view", path, viewRange: [4, -1] })).toBe(
      "     4\tDo not ever reset it.\n     5\tAsk first.",
    );
    expect(await ask({ command: "create", path, fileText: "Shared." })).toBe(`Replaced ${path}.`);
    expect(await ask({ command: "delete", path })).toBe(`Deleted ${path}.`);
    await expect(ask({ command: "view", path })).rejects.toThrow("There is no note at");
  });

  test("the folders are the owner's: another project's, or one it does not have, is not there", async () => {
    await memoryService.write(
      { userId, scope: "project", projectId: other.id },
      "secret-plan.md",
      "Elsewhere",
      { source: "person" },
    );
    expect(await ask({ command: "view", path: "/memories" })).toBe(
      "/memories:\n- /memories/project/ (0 notes)\n- /memories/personal/ (0 notes)",
    );
    await expect(ask({ command: "view", path: "/memories/bot" })).rejects.toThrow(
      "There is no such folder",
    );
    await expect(
      ask({ command: "view", path: "/memories/project/../personal/x.md" }),
    ).rejects.toThrow();
    await expect(ask({ command: "view", path: "/etc/passwd" })).rejects.toThrow(
      "Memory paths start with /memories/",
    );
    await expect(
      ask({ command: "create", path: "/memories/project/Bad Name.md", fileText: "x" }),
    ).rejects.toThrow("lowercase");
  });

  test("a note moves between the owner's folders, and a bot has its own", async () => {
    await ask({ command: "create", path: "/memories/project/tone.md", fileText: "Be brief." });
    await ask({
      command: "rename",
      oldPath: "/memories/project/tone.md",
      newPath: "/memories/personal/tone.md",
    });
    const asBot = {
      owner: { userId, botId: bot.id },
      actor: { source: "bot" as const, botId: bot.id },
      writable: true,
    };
    expect(await ask({ command: "view", path: "/memories/personal" }, asBot)).toBe(
      "/memories/personal:\n- tone.md: Be brief.",
    );
    await ask(
      { command: "create", path: "/memories/bot/role.md", fileText: "I water plants." },
      asBot,
    );
    await expect(ask({ command: "view", path: "/memories/bot/role.md" })).rejects.toThrow(
      "There is no such folder",
    );
    expect((await memoryService.folders(asBot.owner)).map((folder) => folder.scope)).toEqual([
      "bot",
      "personal",
    ]);
  });

  test("an owner that may only read is refused every change", async () => {
    const reading = { ...caller, writable: false };
    expect(await ask({ command: "view", path: "/memories/personal" }, reading)).toContain(
      "tone.md",
    );
    await expect(
      ask({ command: "delete", path: "/memories/personal/tone.md" }, reading),
    ).rejects.toThrow("can only be read now");
  });

  test("str_replace takes text that is there once, and a note has a size", async () => {
    const path = "/memories/project/twice.md";
    await ask({ command: "create", path, fileText: "a b a" });
    await expect(ask({ command: "str_replace", path, oldStr: "a", newStr: "c" })).rejects.toThrow(
      "more than once",
    );
    await expect(ask({ command: "str_replace", path, oldStr: "z", newStr: "c" })).rejects.toThrow(
      "not found",
    );
    await expect(ask({ command: "create", path, fileText: "x".repeat(8001) })).rejects.toThrow(
      "at most 8000",
    );
  });

  test("every change is in the history with who made it, never the body", async () => {
    await ask(
      { command: "create", path: "/memories/project/by-thread.md", fileText: "Hidden body" },
      inProject,
    );
    const [latest] = await memoryService.history(userId);
    expect(latest).toMatchObject({ name: "by-thread.md", action: "created", source: "thread" });
    expect(JSON.stringify(latest)).not.toContain("Hidden body");
  });

  test("the person edits, renames and deletes a note by id", async () => {
    const note = (await memoryService.list(userId)).find((row) => row.name === "by-thread.md")!;
    const renamed = await memoryService.update(userId, note.id, {
      name: "kept.md",
      body: "Changed",
    });
    expect(renamed).toMatchObject({ name: "kept.md", body: "Changed", scope: "project" });
    await memoryService.removeById(userId, note.id);
    expect((await memoryService.list(userId)).some((row) => row.id === note.id)).toBe(false);
  });
});

run("memory is each person's (postgres)", async () => {
  const { db } = await import("@aven/db/client");
  const { users } = await import("@aven/db/schema/users");
  const { eq } = await import("drizzle-orm");
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { runtimesService } = await import("../runtimes/service");
  const { projectsService } = await import("../projects/service");
  const { memoryService } = await import("./service");
  const { runMemoryCommand } = await import("./commands");

  const { userId, orgA, cleanup } = await seedOrgPair();
  const otherId = `u2-${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(users).values({ id: otherId, name: "Other", email: `${otherId}@aven.test` });
  const runner = (await runtimesService.create(orgA, userId, { name: "m2" })).runtime;
  const { project } = await seedProject(orgA, userId, runner.id, "shared-repo");
  afterAll(async () => {
    await db.delete(users).where(eq(users.id, otherId));
    await cleanup();
  });

  const as = (who: string) => ({
    owner: { userId: who, projectId: project.id },
    actor: { source: "person" as const },
    writable: true,
  });

  test("two people in one project see only their own project and personal notes", async () => {
    await runMemoryCommand(as(userId), {
      command: "create",
      path: "/memories/project/mine.md",
      fileText: "Mine",
    });
    await runMemoryCommand(as(userId), {
      command: "create",
      path: "/memories/personal/me.md",
      fileText: "Me",
    });
    expect(
      await runMemoryCommand(as(otherId), { command: "view", path: "/memories/project" }),
    ).toBe("/memories/project: no notes yet.");
    expect(
      await runMemoryCommand(as(otherId), { command: "view", path: "/memories/personal" }),
    ).toBe("/memories/personal: no notes yet.");
    await expect(
      runMemoryCommand(as(otherId), { command: "delete", path: "/memories/personal/me.md" }),
    ).rejects.toThrow("There is no note");
    expect((await memoryService.folders(as(otherId).owner)).flatMap((f) => f.notes)).toEqual([]);
  });

  test("deleting the project takes its notes, every person's, keeps personal ones, and takes no more", async () => {
    await runMemoryCommand(as(otherId), {
      command: "create",
      path: "/memories/project/theirs.md",
      fileText: "Theirs",
    });
    await projectsService.remove(orgA, userId, project.id, () => undefined);
    const left = [...(await memoryService.list(userId)), ...(await memoryService.list(otherId))];
    expect(left.map((note) => note.name)).toEqual(["me.md"]);
    await expect(
      runMemoryCommand(as(userId), {
        command: "create",
        path: "/memories/project/late.md",
        fileText: "Late",
      }),
    ).rejects.toThrow("This project was deleted.");
  });

  test("the index lists a folder's latest notes and says how many more there are", async () => {
    const place = { userId, scope: "personal" as const };
    for (let i = 0; i < 45; i++) {
      await memoryService.write(place, `n${String(i).padStart(2, "0")}.md`, `Note ${i}`, {
        source: "person",
      });
    }
    const [personal] = await memoryService.folders({ userId });
    expect(personal!.notes).toHaveLength(40);
    expect(personal!.more).toBe(6);
  });
});

run("memoryService.create (postgres)", async () => {
  const { signUp } = await import("../../testing/sign-up");
  const { botsService } = await import("../bots/service");
  const { memoryService } = await import("./service");

  const person = await signUp("Mem");
  const stranger = await signUp("Stranger");
  afterAll(async () => {
    await person.remove();
    await stranger.remove();
  });

  test("the person writes in their own folders only: another's bot or a project they cannot see is not found", async () => {
    const theirs = await botsService.create(stranger.userId, { name: "Theirs", instruction: "x" });
    const mine = await botsService.create(person.userId, { name: "Mine", instruction: "x" });
    const made = await memoryService.create(person.userId, {
      scope: "bot",
      botId: mine.id,
      name: "role.md",
      body: "Hello",
    });
    expect(made).toMatchObject({ scope: "bot", botId: mine.id, description: "Hello" });
    await expect(
      memoryService.create(person.userId, {
        scope: "bot",
        botId: theirs.id,
        name: "x.md",
        body: "x",
      }),
    ).rejects.toThrow("Bot not found");
    await expect(
      memoryService.create(person.userId, {
        scope: "project",
        projectId: crypto.randomUUID(),
        name: "x.md",
        body: "x",
      }),
    ).rejects.toThrow("Project not found");
    await expect(
      memoryService.create(person.userId, {
        scope: "bot",
        botId: mine.id,
        name: "role.md",
        body: "y",
      }),
    ).rejects.toThrow("already");
    await expect(memoryService.removeById(stranger.userId, made.id)).rejects.toThrow(
      "Note not found",
    );
  });
});
