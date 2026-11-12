import type { AgentPrompt } from "@anvia/core";
import { sentPrompt } from "@aven/agents/attachments";

import type { KeptAttachment, SandboxPaths } from "@aven/agents/types";
import type { RunAttachment } from "@aven/protocol/types";
import type { RunRecord, ThreadWorkspaces } from "./types";

type Stores = Pick<ThreadWorkspaces, "uploads" | "artifacts">;

export async function keepAttachments(
  { uploads, artifacts }: Stores,
  threadId: string,
  attachments: readonly RunAttachment[],
): Promise<KeptAttachment[]> {
  if (!uploads || !artifacts) throw new Error("This runner cannot take attached files");
  const kept: KeptAttachment[] = [];
  for (const { data, ...file } of attachments) {
    const bytes = Uint8Array.fromBase64(data);
    const path = await uploads.save(threadId, file.name, bytes);
    if (file.image) await artifacts.keep(threadId, file.image, bytes);
    kept.push({ ...file, path });
  }
  return kept;
}

export async function promptOf(
  record: RunRecord,
  stores: Stores,
  paths?: SandboxPaths,
): Promise<AgentPrompt> {
  const attachments = await placedAttachments(stores, record.thread.id, record.attachments ?? []);
  const { mentions, skillListing: skills } = record;
  const images = new Map<string, string>();
  for (const { image } of attachments) {
    const content = image && (await stores.artifacts?.read(record.thread.id, image));
    if (image && content) images.set(image, content.data);
  }
  return sentPrompt(record.prompt ?? "", { attachments, images, mentions, skills, paths });
}

async function placedAttachments(
  stores: Stores,
  threadId: string,
  attachments: readonly KeptAttachment[],
) {
  const uploads = stores.uploads;
  if (!uploads?.settle && !uploads?.placed) return attachments;
  await uploads.settle?.(threadId);
  const placed = uploads.placed;
  if (!placed) return attachments;
  return attachments.map((file) => {
    const name = file.path.slice(
      Math.max(file.path.lastIndexOf("/"), file.path.lastIndexOf("\\")) + 1,
    );
    const path = placed(threadId, name);
    if (!path) return file;
    uploads.claim?.(threadId, name);
    return { ...file, path };
  });
}
