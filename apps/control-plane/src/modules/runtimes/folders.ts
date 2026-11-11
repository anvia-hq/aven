import { z } from "zod";

import { ConflictError, describeError, UnavailableError, UnprocessableError } from "../../errors";
import type { RuntimeHub } from "./hub";
import type {
  FoldersCreateResult,
  FoldersFilesResult,
  FoldersListResult,
  FoldersReadmeResult,
} from "@aven/protocol/types";

const CALL_MS = 15_000;

const listed: z.ZodType<FoldersListResult> = z.object({
  path: z.string().nullable(),
  parent: z.string().nullable(),
  folders: z.array(z.object({ name: z.string(), path: z.string(), git: z.boolean() })),
});

const created: z.ZodType<FoldersCreateResult> = z.object({ path: z.string() });

const files: z.ZodType<FoldersFilesResult> = z.object({
  entries: z.array(
    z.object({ name: z.string(), path: z.string(), type: z.enum(["file", "directory"]) }),
  ),
});

const readme: z.ZodType<FoldersReadmeResult> = z.object({
  readme: z
    .object({ name: z.string(), path: z.string(), text: z.string(), truncated: z.boolean() })
    .nullable(),
});

async function ask<T>(
  hub: RuntimeHub,
  runtimeId: string,
  method: "folders.list" | "folders.create" | "folders.files" | "folders.readme",
  params: object,
  shape: z.ZodType<T>,
): Promise<T> {
  const runner = hub.get(runtimeId);
  if (!runner) throw new UnavailableError("The computer is offline");
  const reply = await runner.call(method, params, CALL_MS).catch((error: unknown) => {
    const reason = describeError(error);
    if (/unknown call/i.test(reason)) {
      throw new ConflictError("Update this computer's runner to browse its folders");
    }
    if (
      /does not serve|not on this machine|already exists|slash|empty|serves no|outside the folder|not in the folder/i.test(
        reason,
      )
    ) {
      throw new UnprocessableError(reason);
    }
    console.warn(`Runner ${runtimeId} did not take ${method}:`, reason);
    throw new UnavailableError("The computer did not answer");
  });
  return shape.parse(reply);
}

export const runnerFolders = (hub: RuntimeHub) => ({
  list: (runtimeId: string, path: string | undefined) =>
    ask(hub, runtimeId, "folders.list", { path }, listed),
  create: (runtimeId: string, path: string, name: string) =>
    ask(hub, runtimeId, "folders.create", { path, name }, created),
  files: (runtimeId: string, folder: string, path: string) =>
    ask(hub, runtimeId, "folders.files", { folder, path }, files),
  readme: (runtimeId: string, folder: string) =>
    ask(hub, runtimeId, "folders.readme", { folder }, readme),
});
