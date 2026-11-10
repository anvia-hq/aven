import { z } from "zod";

export const FOLDER_NAME_MAX = 60;

const name = z.string().trim().min(1).max(FOLDER_NAME_MAX);

export const folderParams = z.object({ id: z.uuid() });
export const folderThreadParams = z.object({ threadId: z.uuid() });
export const createFolderBody = z.object({ name });
export const updateFolderBody = z
  .object({ name: name.optional(), open: z.boolean().optional() })
  .refine((body) => body.name !== undefined || body.open !== undefined);
export const moveThreadBody = z.object({ folderId: z.uuid().nullable() });
