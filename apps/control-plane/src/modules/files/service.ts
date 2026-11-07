import type {
  FileContent,
  FileEntry,
  FilesCallMethod,
  FilesCallParams,
  FilesSearchParams,
} from "@aven/protocol/runtime-wire";
import type { z } from "zod";

import { runnerFor, type Available } from "../runtimes/ask-runner";
import type { RuntimeHub } from "../runtimes/hub";
import { fileAnswer, folderAnswer, searchAnswer } from "./schema";

export type FolderResult = Available<{ entries: FileEntry[] }>;
export type FileResult = Available<FileContent>;
export type SearchResult = Available<{ paths: string[] }>;

export function createFilesService(hub: RuntimeHub) {
  const runner = runnerFor(hub);

  const ask = <T>(
    organizationId: string,
    method: FilesCallMethod,
    params: FilesCallParams | FilesSearchParams,
    schema: z.ZodType<T>,
  ) =>
    runner.ask(organizationId, method, params, schema, {
      logged: `The ${method} call was refused:`,
      message: "The files could not be read",
    });

  return {
    async list(organizationId: string, threadId: string, path: string): Promise<FolderResult> {
      const folder = await ask(organizationId, "files.list", { threadId, path }, folderAnswer);
      return folder ? { available: true, entries: folder.entries } : { available: false };
    },

    async read(organizationId: string, threadId: string, path: string): Promise<FileResult> {
      const file = await ask(organizationId, "files.read", { threadId, path }, fileAnswer);
      return file ? { available: true, ...file } : { available: false };
    },

    async search(organizationId: string, threadId: string, query: string): Promise<SearchResult> {
      const found = await ask(organizationId, "files.search", { threadId, query }, searchAnswer);
      return found ? { available: true, paths: found.paths } : { available: false };
    },
  };
}
