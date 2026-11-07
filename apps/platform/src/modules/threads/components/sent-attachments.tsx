import { useState } from "react";

import { isLocalPreview } from "../pending-messages";
import type { MessageAttachment } from "../types";
import { FileChip } from "./file-chip";
import { ImageViewer } from "./image-viewer";
import { SentImage } from "./sent-image";

export function SentAttachments({
  artifactsPath,
  attachments,
}: {
  artifactsPath: string;
  attachments: MessageAttachment[];
}) {
  const [viewing, setViewing] = useState<number | null>(null);
  const images = attachments.filter((file) => file.image);

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        {attachments.map((file, index) =>
          file.image ? (
            <SentImage
              key={index}
              artifactsPath={artifactsPath}
              file={file}
              onOpen={() => setViewing(images.indexOf(file))}
            />
          ) : (
            <FileChip key={index} name={file.name} size={file.size} />
          ),
        )}
      </div>
      <ImageViewer
        images={images.map((file) => ({
          src: isLocalPreview(file.image!) ? file.image! : `${artifactsPath}/${file.image}`,
          label: file.name,
        }))}
        index={viewing}
        onIndex={setViewing}
        onClose={() => setViewing(null)}
      />
    </>
  );
}
