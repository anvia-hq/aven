import { describe, expect, test } from "bun:test";

import { ConflictError } from "../../errors";
import { createEnvironmentService } from "./service";

const access = { cloneUrl: "https://example.test/acme/app.git", defaultBranch: "main", token: "t" };

function setup(answer: () => Promise<unknown>) {
  const asked: { method: string; params: unknown }[] = [];
  let time = 0;
  const service = createEnvironmentService(
    {
      ask: (async (_scope: string, method: string, params: unknown) => {
        asked.push({ method, params });
        return answer();
      }) as never,
    },
    { repoAccess: async () => access, now: () => new Date(Date.UTC(2026, 10, 10, 0, 0, time++)) },
  );
  return { service, asked };
}

describe("taking a snapshot of a thread's environment", () => {
  test("starts at once, asks the runner with the repository's access, and remembers when it was saved", async () => {
    const done = Promise.withResolvers<{ image: string }>();
    const { service, asked } = setup(() => done.promise);

    const started = await service.snapshot("org", "t1");
    expect(started).toMatchObject({ state: "running" });
    expect(asked).toEqual([
      {
        method: "environment.save",
        params: { threadId: "t1", organizationId: "org", access },
      },
    ]);
    expect(service.state("t1").state).toBe("running");

    done.resolve({ image: "aven-env-x" });
    await Bun.sleep(5);
    expect(service.state("t1")).toEqual({ state: "idle", savedAt: "2026-11-10T00:00:01.000Z" });
  });

  test("refuses a second snapshot while one is being taken", async () => {
    const { service } = setup(() => new Promise(() => undefined));
    await service.snapshot("org", "t1");
    await expect(service.snapshot("org", "t1")).rejects.toBeInstanceOf(ConflictError);
  });

  test("keeps the runner's reason when it fails, and the time of the snapshot before it", async () => {
    let calls = 0;
    const { service } = setup(async () => {
      calls += 1;
      if (calls === 1) return { image: "aven-env-x" };
      throw new Error("The repository has no .aven/setup: write one, then save the environment");
    });
    await service.snapshot("org", "t1");
    await Bun.sleep(5);
    const saved = service.state("t1").savedAt;
    await service.snapshot("org", "t1");
    await Bun.sleep(5);

    expect(service.state("t1")).toEqual({
      state: "idle",
      savedAt: saved,
      error: "The repository has no .aven/setup: write one, then save the environment",
    });
  });

  test("refuses a second request that arrives while the repository's access is still being fetched", async () => {
    const gate = Promise.withResolvers<typeof access>();
    const asked: unknown[] = [];
    const service = createEnvironmentService(
      {
        ask: (async (...args: unknown[]) => {
          asked.push(args);
          return new Promise(() => undefined);
        }) as never,
      },
      { repoAccess: () => gate.promise },
    );
    const first = service.snapshot("org", "t1");
    await expect(service.snapshot("org", "t1")).rejects.toBeInstanceOf(ConflictError);
    gate.resolve(access);
    await first;
    expect(asked).toHaveLength(1);
  });

  test("goes back to what it was when the access cannot be fetched", async () => {
    const service = createEnvironmentService(
      { ask: (async () => ({ image: "x" })) as never },
      {
        repoAccess: async () => {
          throw new Error("GitHub could not be reached");
        },
      },
    );
    await expect(service.snapshot("org", "t1")).rejects.toThrow("GitHub could not be reached");
    expect(service.state("t1")).toEqual({ state: "idle" });
  });

  test("another thread is its own", async () => {
    const { service } = setup(() => new Promise(() => undefined));
    await service.snapshot("org", "t1");
    expect(service.state("t2")).toEqual({ state: "idle" });
  });
});
