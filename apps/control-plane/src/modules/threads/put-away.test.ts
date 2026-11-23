import { afterAll, describe, expect, test } from "bun:test";

import { seedOrgPair } from "../../testing/seed-org-pair";
import type { RuntimeHub } from "../runtimes/hub";
import { runtimesService } from "../runtimes/service";
import { createPutAwayThread } from "./put-away";

const run = process.env.DATABASE_URL ? describe : describe.skip;

const until = async (check: () => boolean) => {
  const deadline = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out");

    await Bun.sleep(5);
  }
};

run("putting a thread away (real postgres)", async () => {
  const seed = await seedOrgPair();
  afterAll(() => seed.cleanup());
  const { runtime } = await runtimesService.create(seed.orgA, seed.userId, { name: "manual" });
  const thread = { id: "t-1", runtimeId: runtime.id };

  function harness({ connected = true, open = 0 } = {}) {
    const calls: { method: string; params: unknown }[] = [];
    const asked: string[] = [];
    const hub = {
      get: (id: string) => {
        asked.push(id);
        return connected && id === thread.runtimeId
          ? {
              call: async (method: string, params: unknown) => {
                calls.push({ method, params });
                return { released: true };
              },
            }
          : undefined;
      },
    } as unknown as Pick<RuntimeHub, "get">;
    const cancelled: string[] = [];
    const stopped: string[] = [];
    const reclaimed: string[] = [];
    const looked: string[] = [];
    const putAway = createPutAwayThread({
      cancel: (id) => cancelled.push(id),
      hub,
      openThreads: async (runtimeId) => {
        looked.push(runtimeId);
        return open;
      },
      stop: async (runtimeId) => {
        stopped.push(runtimeId);
      },
      reclaim: async (runtimeId) => {
        reclaimed.push(runtimeId);
      },
    });
    return { asked, calls, cancelled, looked, stopped, reclaimed, putAway };
  }

  test("stops the run and asks the thread's runner to free its sandbox", async () => {
    const { calls, cancelled, putAway } = harness();

    putAway(thread);
    expect(cancelled).toEqual([thread.id]);
    await until(() => calls.length > 0);

    expect(calls).toEqual([{ method: "sandbox.release", params: { threadId: thread.id } }]);
  });

  test("a runner that is away has nothing to free, and the run is stopped all the same", async () => {
    const { asked, calls, cancelled, putAway } = harness({ connected: false });

    putAway(thread);
    expect(cancelled).toEqual([thread.id]);
    await until(() => asked.length > 0);

    expect(asked).toEqual([thread.runtimeId]);
    expect(calls).toEqual([]);
  });

  test("a sandbox no other thread uses is stopped and queued for reclaim as soon as the thread is put away", async () => {
    const { looked, putAway, stopped, reclaimed } = harness();

    putAway(thread);
    await until(() => reclaimed.length > 0);

    expect(looked).toEqual([thread.runtimeId]);
    expect(stopped).toEqual([thread.runtimeId]);
    expect(reclaimed).toEqual([thread.runtimeId]);
  });

  test("a sandbox another thread is still open on is left running", async () => {
    const { looked, putAway, stopped, reclaimed } = harness({ open: 1 });

    putAway(thread);
    await until(() => looked.length > 0);
    await Bun.sleep(20);

    expect(stopped).toEqual([]);
    expect(reclaimed).toEqual([]);
  });
});
