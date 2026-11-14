import { afterAll, describe, expect, test } from "bun:test";

import { seedOrgPair } from "../../testing/seed-org-pair";
import { RuntimeOfflineError, type RuntimeConnection } from "./hub";
import { reachRunner, releaseThread } from "./providers";
import { runtimesService } from "./service";

const run = process.env.DATABASE_URL ? describe : describe.skip;

const connection = { closed: false } as unknown as RuntimeConnection;
const nothingConnected = { get: () => undefined };

run("reaching a runtime's runner (real postgres)", async () => {
  const seed = await seedOrgPair();
  afterAll(() => seed.cleanup());

  const manual = async () =>
    (await runtimesService.create(seed.orgA, seed.userId, { name: "manual" })).runtime.id;

  test("uses the runner that is connected without asking for its provider", async () => {
    const hub = { get: (id: string) => (id === "never-recorded" ? connection : undefined) };

    expect(await reachRunner(hub, { runtimeId: "never-recorded" })).toBe(connection);
  });

  test("cannot start a manual runner that is not connected, and says why", async () => {
    const runtimeId = await manual();

    await expect(reachRunner(nothingConnected, { runtimeId, threadId: "t1" })).rejects.toThrow(
      new RuntimeOfflineError("The runtime for this project is offline"),
    );
    await expect(
      reachRunner(nothingConnected, { runtimeId, threadId: "t1" }, "The bot's computer is offline"),
    ).rejects.toThrow(new RuntimeOfflineError("The bot's computer is offline"));
  });

  test("treats a revoked or missing runtime as offline", async () => {
    const runtimeId = await manual();
    await runtimesService.revoke(seed.orgA, seed.userId, runtimeId);

    for (const id of [runtimeId, crypto.randomUUID()]) {
      await expect(
        reachRunner(nothingConnected, { runtimeId: id, threadId: "t1" }),
      ).rejects.toBeInstanceOf(RuntimeOfflineError);
    }
  });

  test("a thread on a revoked or missing runtime has no runner to ask to free it", async () => {
    const runtimeId = await manual();
    await runtimesService.revoke(seed.orgA, seed.userId, runtimeId);
    const asked: string[] = [];
    const hub = {
      get: (id: string) => {
        asked.push(id);
        return connection;
      },
    };

    for (const id of [runtimeId, crypto.randomUUID()]) {
      await releaseThread(hub, { runtimeId: id, threadId: "t1" });
    }
    expect(asked).toEqual([]);
  });
});
