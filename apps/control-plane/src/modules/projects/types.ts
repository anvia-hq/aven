import type {
  FoldersCommitsResult,
  FoldersFilesResult,
  FoldersReadmeResult,
} from "@aven/protocol/types";

export type ProjectFolders = {
  files: (runtimeId: string, folder: string, path: string) => Promise<FoldersFilesResult>;
  commits: (runtimeId: string, folder: string, page: number) => Promise<FoldersCommitsResult>;
  readme: (runtimeId: string, folder: string) => Promise<FoldersReadmeResult>;
};
