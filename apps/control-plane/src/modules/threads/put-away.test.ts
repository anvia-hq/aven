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

  function harness({ connected = true } = {}) {
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
    const putAway = createPutAwayThread({ cancel: (id) => cancelled.push(id), hub });
    return { asked, calls, cancelled, putAway };
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
});
