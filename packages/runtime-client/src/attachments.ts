import type { AgentPrompt } from "@anvia/core";
import { promptWithAttachments, type KeptAttachment } from "@aven/agents/attachments";
import type { RunAttachment } from "@aven/protocol/runtime-wire";

import type { RunRecord } from "./run-records";
import type { ThreadWorkspaces } from "./sandbox";

type Stores = Pick<ThreadWorkspaces, "uploads" | "artifacts">;

// Copies the files sent with a message where the agent finds them, in /uploads, and keeps a copy
// of each image for the transcript to show (decision 0034). The bytes are not kept in the run's
// record: what is there is where they went.
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

// What the agent is asked: the user's text, or with files, the text, where the files are, and the
// images themselves, read back from the copies `keepAttachments` made.
export async function promptOf(record: RunRecord, { artifacts }: Stores): Promise<AgentPrompt> {
  const prompt = record.prompt ?? "";
  if (!record.attachments?.length) return prompt;
  const images = new Map<string, string>();
  for (const { image } of record.attachments) {
    const content = image && (await artifacts?.read(record.thread.id, image));
    if (image && content) images.set(image, content.data);
  }
  return promptWithAttachments(prompt, record.attachments, images);
}
