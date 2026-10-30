import type { FileContent, FileEntry, FilesCallMethod } from "@aven/protocol/runtime-wire";
import type { z } from "zod";

import { describeError, UnavailableError } from "../../errors";
import { runnerFor, type Available } from "../runtimes/ask-runner";
import type { RuntimeHub } from "../runtimes/hub";
import { fileAnswer, folderAnswer } from "./schema";

export type FolderResult = Available<{ entries: FileEntry[] }>;
export type FileResult = Available<FileContent>;

// The files of a thread's workspace, read through the runner that holds it (decision 0031). Every
// call starts from a thread of the caller's organization.
export function createFilesService(hub: RuntimeHub) {
  const runner = runnerFor(hub);

  const ask = <T>(
    organizationId: string,
    threadId: string,
    method: FilesCallMethod,
    path: string,
    schema: z.ZodType<T>,
  ) =>
    // The runtime's own reason stays in the log; the client gets a fixed message.
    runner.ask(organizationId, method, { threadId, path }, schema, (error) => {
      console.warn(`The ${method} call was refused:`, describeError(error));
      throw new UnavailableError("The files could not be read");
    });

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
