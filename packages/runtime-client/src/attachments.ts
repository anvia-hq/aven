import type { AgentPrompt } from "@anvia/core";
import { sentPrompt } from "@aven/agents/attachments";

import type { KeptAttachment } from "@aven/agents/types";
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

export async function promptOf(record: RunRecord, { artifacts }: Stores): Promise<AgentPrompt> {
  const { attachments = [], mentions, skillListing: skills } = record;
  const images = new Map<string, string>();
  for (const { image } of attachments) {
    const content = image && (await artifacts?.read(record.thread.id, image));
    if (image && content) images.set(image, content.data);
  }
  return sentPrompt(record.prompt ?? "", { attachments, images, mentions, skills });
}
