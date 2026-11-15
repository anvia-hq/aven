import { afterAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { runtimes } from "@aven/db/schema/runtimes";
import { threads } from "@aven/db/schema/threads";
import { and, eq, ne } from "drizzle-orm";

import type { RuntimeConnection } from "./hub";
import { threadsService } from "../threads/service";
import { createCloudIdle } from "./cloud-idle";
import { CLOUD_RUNTIME_ID, runtimesService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

const MINUTE = 60_000;

const WINDOWS = { agentIdleMs: 5 * MINUTE, userIdleMs: 20 * MINUTE };

const connection = {} as unknown as RuntimeConnection;

run("stopping idle Aven Cloud computers (real postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { seedProject } = await import("../../testing/seed-project");
  const { userId, orgA, cleanup } = await seedOrgPair();
  const keptKey = process.env.AVEN_BOAT_API_KEY;
  const keptProvider = process.env.AVEN_CLOUD_PROVIDERS;
  const [kept] = await db.select().from(runtimes).where(eq(runtimes.id, CLOUD_RUNTIME_ID));

  process.env.AVEN_BOAT_API_KEY = "boat_test_key_for_idle";
  process.env.AVEN_CLOUD_PROVIDERS = "boat";
  await runtimesService.ensureCloud();

  afterAll(async () => {
    await cleanup();

    if (!kept) await db.delete(runtimes).where(eq(runtimes.id, CLOUD_RUNTIME_ID));

    if (keptKey === undefined) delete process.env.AVEN_BOAT_API_KEY;
    else process.env.AVEN_BOAT_API_KEY = keptKey;

    if (keptProvider === undefined) delete process.env.AVEN_CLOUD_PROVIDERS;
    else process.env.AVEN_CLOUD_PROVIDERS = keptProvider;
  });

  async function cloudThread(name: string, updatedAt: Date) {
    const { project } = await seedProject(orgA, userId, null, name);
    const thread = await threadsService.create(orgA, userId, {
      projectId: project.id,
      runtimeId: CLOUD_RUNTIME_ID,
    });

    await db.update(threads).set({ updatedAt }).where(eq(threads.id, thread.id));
    return { ...thread, name };
  }

  function harness(options: { connected: string[]; running?: string[]; pageSize?: number }) {
    const stopped: string[] = [];
    const extended: string[] = [];
    const clock = { at: Date.now() };
    const idle = createCloudIdle({
      intervalMs: 60_000,
      hub: {
        get: (runtimeId: string) =>
          options.connected.includes(runtimeId) ? connection : undefined,
      },
      running: (threadId) => (options.running ?? []).includes(threadId),
      lastEventAt: () => undefined,
      windows: WINDOWS,
      pageSize: options.pageSize,
      now: () => clock.at,
      stop: async (runtimeId) => {
        stopped.push(runtimeId);
      },
      extend: async (runtimeId) => {
        extended.push(runtimeId);
      },
    });
    return { clock, extended, idle, stopped };
  }

  test("stops a sandbox no agent and no person has touched for their windows, and leaves a used one", async () => {
    const idle = await cloudThread("idle-one", new Date(Date.now() - 3 * 60 * MINUTE));
    const used = await cloudThread("used-one", new Date());
    const sweep = harness({ connected: [idle.runtimeId, used.runtimeId] });

    expect(await sweep.idle.sweep()).toBe(0);

    await db
      .update(threads)
      .set({ updatedAt: new Date(sweep.clock.at + 15 * MINUTE) })
      .where(eq(threads.id, used.id));
    sweep.clock.at += 21 * MINUTE;

    expect(await sweep.idle.sweep()).toBe(1);
    expect(sweep.stopped).toEqual([idle.runtimeId]);
  });

  test("never stops a sandbox that is working, and keeps its provider timer going while it does", async () => {
    const working = await cloudThread("working-one", new Date(Date.now() - 3 * 60 * MINUTE));
    const sweep = harness({ connected: [working.runtimeId], running: [working.id] });

    await sweep.idle.sweep();
    sweep.clock.at += 21 * MINUTE;

    expect(await sweep.idle.sweep()).toBe(0);
    expect(sweep.stopped).toEqual([]);
    expect(sweep.extended).toEqual([working.runtimeId]);
  });

  test("a sandbox whose runner is not connected is left alone", async () => {
    await cloudThread("away-one", new Date(Date.now() - 3 * 60 * MINUTE));
    const sweep = harness({ connected: [] });

    await sweep.idle.sweep();
    sweep.clock.at += 21 * MINUTE;
    await sweep.idle.sweep();

    expect(sweep.stopped).toEqual([]);
    expect(sweep.extended).toEqual([]);
  });

  test("reads every thread of a sandbox, so a capped list of sandboxes never hides a running one", async () => {
    const first = await cloudThread("pair-one", new Date());
    const second = await cloudThread("pair-two", new Date());
    await db.update(threads).set({ runtimeId: first.runtimeId }).where(eq(threads.id, second.id));

    const { threads: rows } = await runtimesService.liveCloudSandboxes({ limit: 1 });
    const [chosen] = rows;
    const ofSandbox = await db
      .select({ threadId: threads.id })
      .from(threads)
      .where(and(eq(threads.runtimeId, chosen!.runtimeId), ne(threads.state, "archived")));

    expect(new Set(rows.map(({ runtimeId }) => runtimeId)).size).toBe(1);
    expect(rows.map(({ threadId }) => threadId).sort()).toEqual(
      ofSandbox.map(({ threadId }) => threadId).sort(),
    );
  });

  test("looks at every sandbox, however many there are, one page at a time", async () => {
    const old = new Date(Date.now() - 3 * 60 * MINUTE);
    const one = await cloudThread("page-one", old);
    const two = await cloudThread("page-two", old);
    const sweep = harness({ connected: [one.runtimeId, two.runtimeId], pageSize: 1 });

    await sweep.idle.sweep();
    sweep.clock.at += 21 * MINUTE;

    expect(await sweep.idle.sweep()).toBe(2);
    expect(sweep.stopped.sort()).toEqual([one.runtimeId, two.runtimeId].sort());
  });

  test("a sandbox keeps a whole idle window after the server sees it, so a restart stops nothing early", async () => {
    const seen = await cloudThread("seen-one", new Date(Date.now() - 3 * 60 * MINUTE));
    const sweep = harness({ connected: [seen.runtimeId] });

    await sweep.idle.sweep();
    sweep.clock.at += 19 * MINUTE;

    expect(await sweep.idle.sweep()).toBe(0);
    expect(sweep.stopped).toEqual([]);
  });
});
