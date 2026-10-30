import type { FileContent, FileEntry } from "@aven/protocol/runtime-wire";
import type { z } from "zod";

import { UnavailableError } from "../../errors";
import { RuntimeOfflineError, type RuntimeHub } from "../runtimes/hub";
import { threadsService } from "../threads/service";
import { fileAnswer, folderAnswer } from "./schema";

export type FolderResult = { available: false } | { available: true; entries: FileEntry[] };
export type FileResult = { available: false } | ({ available: true } & FileContent);

// The files of a thread's workspace, read through the runner that holds it (decision 0031). Every
// call starts from a thread of the caller's organization.
export function createFilesService(hub: RuntimeHub) {
  async function ask<T>(
    organizationId: string,
    threadId: string,
    method: "files.list" | "files.read",
    path: string,
    schema: z.ZodType<T>,
  ) {
    const thread = await threadsService.require(organizationId, threadId);
    const connection = hub.get(thread.runtimeId);
    if (!connection) throw new RuntimeOfflineError();
    // The runtime's own reason stays in the log; the client gets a fixed message.
    const answer = await connection.call(method, { threadId, path }).catch((error: unknown) => {
      console.warn(
        `The ${method} call was refused:`,
        error instanceof Error ? error.message : error,
      );
      throw new UnavailableError("The files could not be read");
    });
    const parsed = schema.safeParse(answer);
    if (!parsed.success) throw new UnavailableError("The runtime gave an unexpected answer");
    return parsed.data;
  }

  return {
    async list(organizationId: string, threadId: string, path: string): Promise<FolderResult> {
      const folder = await ask(organizationId, threadId, "files.list", path, folderAnswer);
      return folder ? { available: true, entries: folder.entries } : { available: false };
    },

    async read(organizationId: string, threadId: string, path: string): Promise<FileResult> {
      const file = await ask(organizationId, threadId, "files.read", path, fileAnswer);
      return file ? { available: true, ...file } : { available: false };
    },
  };
}
