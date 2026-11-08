import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { runtimes } from "@aven/db/schema/runtimes";
import { inArray } from "drizzle-orm";

import { NotFoundError, UnavailableError } from "../../errors";
import type { RuntimeHub } from "../runtimes/hub";
import { createLeftoversService } from "./leftovers";

const run = process.env.DATABASE_URL ? describe : describe.skip;

type Call = { method: string; params: unknown };

run("the Docker leftovers of every runner (real postgres)", () => {
  const tag = crypto.randomUUID().slice(0, 8);
  const [online, offline, old, gone] = [0, 1, 2, 3].map(() => crypto.randomUUID());
  const ids: string[] = [online, offline, old];
  const calls: Call[] = [];

  const leftovers = {
    containers: [
      {
        ref: "c1",
        name: "aven-sandbox-x",
        state: "exited",
        image: "img",
        thread: "t1",
        createdAt: "2026-11-01",
        reason: "Not running (exited)",
      },
    ],
    images: [],
  };

  const hub = {
    get: (id: string) => {
      if (id === online) {
        return {
          call: async (method: string, params: unknown) => {
            calls.push({ method, params });
            return method === "docker.leftovers"
              ? leftovers
              : { removedContainers: 1, removedImages: 0, failed: [] };
          },
        };
      }
      if (id === old) {
        return {
          call: async () => {
            throw new Error("Invalid parameters");
          },
        };
      }
      return undefined;
    },
  } as unknown as RuntimeHub;

  const service = createLeftoversService(hub);

  beforeAll(async () => {
    await db.insert(runtimes).values(
      [
        [online, "online"],
        [offline, "offline"],
        [old, "old"],
      ].map(([id, name]) => ({
        id: id as string,
        name: `${name}-${tag}`,
        tokenHash: `hash-${id}`,
        tokenHint: "hint",
      })),
    );
  });

  afterAll(async () => {
    await db.delete(runtimes).where(inArray(runtimes.id, [online, offline, old]));
  });

  test("asks each online runner, and says which are offline or cannot answer", async () => {
    const rows = (await service.list()).filter((row) => ids.includes(row.runtimeId));
    expect(rows.map((row) => [row.name, row.status])).toEqual([
      [`online-${tag}`, "ok"],
      [`offline-${tag}`, "offline"],
      [`old-${tag}`, "unsupported"],
    ]);
    expect(rows[0]?.containers).toEqual(leftovers.containers);
    expect(rows[1]?.containers).toEqual([]);
  });

  test("passes a removal on to the runner it names and returns what it removed", async () => {
    const request = { containers: ["c1"], images: [] };
    expect(await service.remove(online, request)).toEqual({
      removedContainers: 1,
      removedImages: 0,
      failed: [],
    });
    expect(calls.at(-1)).toEqual({ method: "docker.remove", params: request });
  });

  test("refuses a runner that does not exist, one that is offline and one that fails", async () => {
    const request = { containers: [], images: [] };
    await expect(service.remove(gone, request)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.remove(offline, request)).rejects.toBeInstanceOf(UnavailableError);
    await expect(service.remove(old, request)).rejects.toThrow("aven update");
  });
});
