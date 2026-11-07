import type { MessageAttachment } from "../types";
import { FileChip } from "./file-chip";
import { SentImage } from "./sent-image";

export function SentAttachments({
  artifactsPath,
  attachments,
}: {
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
