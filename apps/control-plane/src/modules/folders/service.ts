import { db } from "@aven/db/client";
import { threadFolderThreads } from "@aven/db/schema/thread-folder-threads";
import { threadFolders } from "@aven/db/schema/thread-folders";
import { and, asc, desc, eq } from "drizzle-orm";

import { NotFoundError } from "../../errors";
import { threadsService } from "../threads/service";

export class FolderNotFoundError extends NotFoundError {
  constructor() {
    super("Folder not found");
  }
}

async function owned(userId: string, id: string) {
  const [folder] = await db
    .select()
    .from(threadFolders)
    .where(and(eq(threadFolders.id, id), eq(threadFolders.userId, userId)));

  if (!folder) throw new FolderNotFoundError();

  return folder;
}

const view = (folder: typeof threadFolders.$inferSelect, threadIds: string[]) => ({
  id: folder.id,
  name: folder.name,
  open: folder.open,
  threadIds,
});

export const foldersService = {
  async list(userId: string) {
    const folders = await db
      .select()
      .from(threadFolders)
      .where(eq(threadFolders.userId, userId))
      .orderBy(desc(threadFolders.createdAt));
    const members = await db
      .select({ threadId: threadFolderThreads.threadId, folderId: threadFolderThreads.folderId })
      .from(threadFolderThreads)
      .where(eq(threadFolderThreads.userId, userId))
      .orderBy(asc(threadFolderThreads.createdAt));
    return folders.map((folder) =>
      view(
        folder,
        members.filter((member) => member.folderId === folder.id).map((member) => member.threadId),
      ),
    );
  },

  async create(userId: string, name: string) {
    const [folder] = await db.insert(threadFolders).values({ userId, name }).returning();
    return view(folder!, []);
  },

  async update(userId: string, id: string, changes: { name?: string; open?: boolean }) {
    await owned(userId, id);
    const [folder] = await db
      .update(threadFolders)
      .set(changes)
      .where(and(eq(threadFolders.id, id), eq(threadFolders.userId, userId)))
      .returning();
    const members = await db
      .select({ threadId: threadFolderThreads.threadId })
      .from(threadFolderThreads)
      .where(eq(threadFolderThreads.folderId, id))
      .orderBy(asc(threadFolderThreads.createdAt));
    return view(
      folder!,
      members.map((member) => member.threadId),
    );
  },

  async remove(userId: string, id: string) {
    await owned(userId, id);
    await db
      .delete(threadFolders)
      .where(and(eq(threadFolders.id, id), eq(threadFolders.userId, userId)));
  },

  async moveThread(userId: string, threadId: string, folderId: string | null) {
    if (folderId === null) {
      await db
        .delete(threadFolderThreads)
        .where(
          and(eq(threadFolderThreads.userId, userId), eq(threadFolderThreads.threadId, threadId)),
        );
      return { threadId, folderId };
    }

    await owned(userId, folderId);
    await threadsService.readableForPerson(userId, threadId);
    await db
      .insert(threadFolderThreads)
      .values({ userId, threadId, folderId })
      .onConflictDoUpdate({
        target: [threadFolderThreads.userId, threadFolderThreads.threadId],
        set: { folderId, createdAt: new Date() },
      });
    return { threadId, folderId };
  },
};
