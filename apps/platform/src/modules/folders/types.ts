import type { Thread } from "../threads/types";

export type Folder = {
  id: string;
  name: string;
  open: boolean;
  threadIds: string[];
};

export type FolderGroup = {
  folder: Folder;
  threads: Thread[];
};

export type FolderedThreads = {
  groups: FolderGroup[];
  unfiled: Thread[];
};

export type NewFolder = {
  tempId: string;
  name: string;
  threadId?: string;
};

export type FolderRename = {
  id: string;
  name: string;
};

export type FolderOpen = {
  id: string;
  open: boolean;
};

export type ThreadMove = {
  threadId: string;
  folderId: string | null;
};

export type FolderDraft = {
  threadId?: string;
};
