import type { Folder, FolderOpen, FolderRename, NewFolder, ThreadMove } from "./types";

const TEMP_PREFIX = "temp-";

export const newTempId = () => `${TEMP_PREFIX}${crypto.randomUUID()}`;

export const isTempId = (id: string) => id.startsWith(TEMP_PREFIX);

const without = (folders: Folder[], threadId: string): Folder[] =>
  folders.map((folder) => ({
    ...folder,
    threadIds: folder.threadIds.filter((id) => id !== threadId),
  }));

export function withFolder(folders: Folder[], { tempId, name, threadId }: NewFolder): Folder[] {
  const created: Folder = {
    id: tempId,
    name,
    open: true,
    threadIds: threadId ? [threadId] : [],
  };
  const rest = threadId ? without(folders, threadId) : folders;
  return [created, ...rest];
}

export const withRename = (folders: Folder[], { id, name }: FolderRename): Folder[] =>
  folders.map((folder) => (folder.id === id ? { ...folder, name } : folder));

export const withOpen = (folders: Folder[], { id, open }: FolderOpen): Folder[] =>
  folders.map((folder) => (folder.id === id ? { ...folder, open } : folder));

export const withoutFolder = (folders: Folder[], id: string): Folder[] =>
  folders.filter((folder) => folder.id !== id);

export function withMove(folders: Folder[], { threadId, folderId }: ThreadMove): Folder[] {
  return without(folders, threadId).map((folder) =>
    folder.id === folderId ? { ...folder, threadIds: [...folder.threadIds, threadId] } : folder,
  );
}
