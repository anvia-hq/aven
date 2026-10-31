import type { MessageAttachment } from "../types";
import { FileChip } from "./file-chip";
import { SentImage } from "./sent-image";

// The files a user message was sent with (decision 0034).
export function SentAttachments({
  threadId,
  attachments,
}: {
  threadId: string;
  attachments: MessageAttachment[];
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {attachments.map((file, index) =>
        file.image ? (
          <SentImage key={index} threadId={threadId} file={file} />
        ) : (
          <FileChip key={index} name={file.name} size={file.size} />
        ),
      )}
    </div>
  );
}
