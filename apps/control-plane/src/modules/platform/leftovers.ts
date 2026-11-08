import { db } from "@aven/db/client";
import { runtimes } from "@aven/db/schema/runtimes";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { describeError, NotFoundError, UnavailableError } from "../../errors";
import type { RuntimeHub } from "../runtimes/hub";
import type { RunnerLeftovers } from "./types";
import type { DockerRemoveParams } from "@aven/protocol/types";

const OLD_RUNNER = /invalid parameters/i;
const LIST_MS = 20_000;
const REMOVE_MS = 180_000;

const listed = z.object({
  containers: z.array(
    z.object({
      ref: z.string(),
      name: z.string(),
      state: z.string(),
      image: z.string(),
      thread: z.string().nullable(),
      createdAt: z.string(),
      reason: z.string(),
    }),
  ),
  images: z.array(
    z.object({
      ref: z.string(),
      id: z.string(),
      size: z.string(),
      createdAt: z.string(),
      reason: z.string(),
    }),
  ),
});

const removed = z.object({
  removedContainers: z.number(),
  removedImages: z.number(),
  failed: z.array(z.object({ ref: z.string(), reason: z.string() })),
});

export function createLeftoversService(hub: RuntimeHub) {
  async function ask(runtimeId: string, name: string): Promise<RunnerLeftovers> {
    const base = { runtimeId, name, containers: [], images: [] };
    const runner = hub.get(runtimeId);
    if (!runner) return { ...base, status: "offline" };
    try {
      const answer = listed.parse(await runner.call("docker.leftovers", {}, LIST_MS));
      return { ...base, ...answer, status: "ok" };
    } catch (error) {
      const reason = describeError(error);
      console.warn(`Runner ${runtimeId} did not list its Docker leftovers:`, reason);
      return OLD_RUNNER.test(reason)
        ? { ...base, status: "unsupported" }
        : { ...base, status: "failed", error: reason };
    }
  }

  return {
    async list() {
      const rows = await db
        .select({ id: runtimes.id, name: runtimes.name })
        .from(runtimes)
        .where(isNull(runtimes.revokedAt))
        .orderBy(asc(runtimes.createdAt));
      return Promise.all(rows.map((row) => ask(row.id, row.name)));
    },

    async remove(runtimeId: string, request: DockerRemoveParams) {
      const [known] = await db
        .select({ id: runtimes.id })
        .from(runtimes)
        .where(and(eq(runtimes.id, runtimeId), isNull(runtimes.revokedAt)));
      if (!known) throw new NotFoundError("There is no such runner");
      const runner = hub.get(runtimeId);
      if (!runner) throw new UnavailableError("The runner is offline");
      try {
        return removed.parse(await runner.call("docker.remove", request, REMOVE_MS));
      } catch (error) {
        const reason = describeError(error);
        console.warn(`Runner ${runtimeId} did not remove its leftovers:`, reason);
        throw new UnavailableError(
          OLD_RUNNER.test(reason)
            ? "The runner could not remove them: it needs aven update"
            : `The runner could not remove them: ${reason}`,
        );
      }
    },
  };
}
