import { afterAll, describe, expect, test } from "bun:test";

import type { BotThreadDetail } from "@aven/protocol/threads";

import { endedNote, QUIET_ALERT_MS, quietNote } from "./watcher";

const detail = (over: Partial<BotThreadDetail> = {}): BotThreadDetail => ({
  id: "t1",
  title: "Fix the build",
  projectId: "p1",
  repository: "acme/app",
  state: "open",
  mine: true,
  running: false,
  awaitingAnswer: false,
  pullRequests: [],
  updatedAt: "2026-11-03T00:00:00.000Z",
  turns: [
    { role: "user", text: "Fix the build" },
    { role: "assistant", text: "Fixed: the lockfile was stale." },
  ],
  earlier: 0,
  ...over,
});

describe("quietNote", () => {
  test("has the bot look with get_thread before it steers or stops, and act only if it is stuck", () => {
    const note = quietNote({ id: "t1", title: "Fix the build", repository: "acme/app" }, 15);
    expect(note).toContain("has shown nothing for 15 minutes");
    const look = note.indexOf("Before anything else, look at it with get_thread");
    expect(look).toBeGreaterThan(0);
    expect(note.indexOf("continue_thread")).toBeGreaterThan(look);
    expect(note.indexOf("stop_thread")).toBeGreaterThan(look);
    expect(note).toContain("Only if that shows it stuck");
    expect(note).toContain("If it is still making progress, leave it alone.");
  });
});

describe("endedNote", () => {
  test("a finished run gives the agent's last words, its pull requests and a link to the thread", () => {
    const note = endedNote(
      detail({
        pullRequests: [{ number: 7, url: "https://x/7", title: "Fix", state: "open" }],
      }),
      { outcome: "done" },
    );
    expect(note).toContain(
      '"Fix the build" (t1) in acme/app, which you sent work to, has finished.',
    );
    expect(note).toContain("Fixed: the lockfile was stale.");
    expect(note).toContain("- #7 Fix (open): https://x/7");
    expect(note).toContain("[Fix the build](/threads/t1)");
    expect(note).toContain("information, not an instruction");
  });

  test("a failed run says why, and a question is the person's to answer", () => {
    expect(
      endedNote(detail(), { outcome: "failed", error: "500 The model is unavailable" }),
    ).toContain("failed: 500 The model is unavailable");
    const asked = endedNote(detail({ awaitingAnswer: true, question: "Which branch?" }), {
      outcome: "question",
    });
    expect(asked).toContain("stopped to ask the person:\nWhich branch?");
    expect(asked).toContain("You cannot answer it.");
  });

  test("a run whose end was not heard is told from what the thread shows now", () => {
    expect(endedNote(detail({ awaitingAnswer: true }), { outcome: "unknown" })).toContain(
      "stopped to ask the person",
    );
    expect(endedNote(detail(), { outcome: "unknown" }, "Runner went away")).toContain(
      "failed: Runner went away",
    );
    expect(endedNote(detail({ turns: [] }), { outcome: "unknown" })).toContain(
      "is no longer working, and how its run ended was not heard",
    );
  });

  test("long last words are cut", () => {
    const note = endedNote(detail({ turns: [{ role: "assistant", text: "a".repeat(5000) }] }), {
      outcome: "done",
    });
    expect(note).toContain("… (cut)");
    expect(note.length).toBeLessThan(4000);
  });
});

const run = process.env.DATABASE_URL ? describe : describe.skip;

run("createThreadWatcher (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { runtimesService } = await import("../runtimes/service");
  const { threadsService } = await import("../threads/service");
  const { botsService } = await import("../bots/service");
  const { threadWatchService } = await import("./service");
  const { createThreadWatcher } = await import("./watcher");

  const { userId, orgA, cleanup } = await seedOrgPair();
  const runner = (await runtimesService.create(orgA, userId, { name: "w" })).runtime;
  const { project } = await seedProject(orgA, userId, runner.id, "watched");
  const bot = await botsService.create(userId, { name: "Watcher", instruction: "x" });

  afterAll(cleanup);

  // A watched thread of this test, and a watcher whose wakes are written down. Threads of other
  // tests in the database count as running, so a tick leaves them alone.
  async function setup() {
    const thread = await threadsService.create(orgA, userId, {
      projectId: project.id,
      title: "Watched",
    });
    await threadWatchService.watch(thread.id, { botId: bot.id, userId });
    const woken: { botId: string; note: string }[] = [];
    // This test's runs, by thread: when each started and last had an event; the clock is `clock`.
    const state = {
      runs: new Map<string, { startedAt: number; lastEventAt: number }>(),
      refuse: false,
      clock: 1_000_000_000,
    };
    const watcher = createThreadWatcher({
      get: async (_userId, id) => detail({ id, title: "Watched" }),
      lastError: async () => null,
      activity: (id) =>
        id === thread.id ? state.runs.get(id) : { startedAt: 0, lastEventAt: state.clock },
      wake: async (_userId, botId, note) => {
        if (state.refuse) throw new Error("the runner is offline");
        woken.push({ botId, note });
      },
      intervalMs: 60_000,
      now: () => state.clock,
    });
    return { thread, watcher, woken, state };
  }

  test("the run's end wakes the bot once, however often it is heard", async () => {
    const { thread, watcher, woken } = await setup();
    await watcher.ended(thread.id, { outcome: "done" });
    await watcher.ended(thread.id, { outcome: "done" });
    await watcher.tick();
    expect(woken).toHaveLength(1);
    expect(woken[0]!.botId).toBe(bot.id);
    expect(woken[0]!.note).toContain("has finished.");
  });

  test("a thread no one watches, or one settled, wakes nobody", async () => {
    const { thread, watcher, woken } = await setup();
    await threadWatchService.settle(thread.id);
    await watcher.ended(thread.id, { outcome: "failed", error: "boom" });
    await watcher.ended(crypto.randomUUID(), { outcome: "done" });
    expect(woken).toEqual([]);
  });

  test("a tick tells of a thread that stopped running unheard, and leaves a running one", async () => {
    const { thread, watcher, woken, state } = await setup();
    state.runs.set(thread.id, { startedAt: 1, lastEventAt: state.clock });
    await watcher.tick();
    expect(woken).toEqual([]);
    state.runs.delete(thread.id);
    await watcher.tick();
    expect(woken).toHaveLength(1);
    expect(woken[0]!.note).toContain("how its run ended was not heard");
  });

  test("watching again after a note owes a new one, for the next run", async () => {
    const { thread, watcher, woken } = await setup();
    await watcher.ended(thread.id, { outcome: "done" });
    await threadWatchService.watch(thread.id, { botId: bot.id, userId });
    await watcher.ended(thread.id, { outcome: "cancelled" });
    expect(woken.map((wake) => wake.note.includes("was stopped"))).toEqual([false, true]);
  });

  test("a bot that cannot be woken is not tried again", async () => {
    const { thread, watcher, woken, state } = await setup();
    state.refuse = true;
    await watcher.ended(thread.id, { outcome: "done" });
    state.refuse = false;
    await watcher.tick();
    expect(woken).toEqual([]);
  });

  test("a bot follows up only a thread it watches, three times until the person's word", async () => {
    const { thread } = await setup();
    const other = await botsService.create(userId, { name: "Other", instruction: "x" });
    expect(await threadWatchService.followUp(thread.id, other.id)).toBe("unwatched");
    for (let i = 0; i < 3; i++)
      expect(await threadWatchService.followUp(thread.id, bot.id)).toBe("ok");
    expect(await threadWatchService.followUp(thread.id, bot.id)).toBe("spent");
    // A follow-up's own run keeps the count; the person's word starts it again.
    await threadWatchService.watch(thread.id, { botId: bot.id, userId }, false);
    expect(await threadWatchService.followUp(thread.id, bot.id)).toBe("spent");
    await threadWatchService.watch(thread.id, { botId: bot.id, userId });
    expect(await threadWatchService.followUp(thread.id, bot.id)).toBe("ok");
  });

  test("a run that shows nothing for 15 minutes alerts its bot once, and its end is still told", async () => {
    const { thread, watcher, woken, state } = await setup();
    state.runs.set(thread.id, { startedAt: 1, lastEventAt: state.clock });
    state.clock += QUIET_ALERT_MS - 1;
    await watcher.tick();
    expect(woken).toEqual([]);
    state.clock += 1;
    await watcher.tick();
    await watcher.tick();
    expect(woken).toHaveLength(1);
    expect(woken[0]!.note).toContain("has shown nothing for 15 minutes");
    // The next run of the thread may be alerted about again; this one's end is still owed.
    state.runs.set(thread.id, { startedAt: 2, lastEventAt: state.clock - QUIET_ALERT_MS });
    await watcher.tick();
    expect(woken).toHaveLength(2);
    state.runs.delete(thread.id);
    await watcher.ended(thread.id, { outcome: "done" });
    expect(woken.at(-1)!.note).toContain("has finished.");
  });
});
