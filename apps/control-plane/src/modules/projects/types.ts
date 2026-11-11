import type { FoldersFilesResult, FoldersReadmeResult } from "@aven/protocol/types";

export type ProjectFolders = {
  files: (runtimeId: string, folder: string, path: string) => Promise<FoldersFilesResult>;
  readme: (runtimeId: string, folder: string) => Promise<FoldersReadmeResult>;
};
