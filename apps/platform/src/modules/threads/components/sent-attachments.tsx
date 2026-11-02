import type { MessageAttachment } from "../types";
import { FileChip } from "./file-chip";
import { SentImage } from "./sent-image";

// The files a user message was sent with (decision 0034).
export function SentAttachments({
  artifactsPath,
  attachments,
}: {
  /** Where the images are read from: the thread's or the bot's artifacts, such as `/api/threads/<id>/artifacts`. */
  artifactsPath: string;
  attachments: MessageAttachment[];
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {attachments.map((file, index) =>
        file.image ? (
          <SentImage key={index} artifactsPath={artifactsPath} file={file} />
        ) : (
          <FileChip key={index} name={file.name} size={file.size} />
        ),
      )}
    </div>
  );
}
