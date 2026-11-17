import { useState } from "react";

import { isLocalPreview } from "../pending-messages";
import type { MessageAttachment } from "../types";
import { FileChip } from "./file-chip";
import { ImageViewer } from "./image-viewer";
import { SentImage } from "./sent-image";

function previewOf(file: MessageAttachment, shown: MessageAttachment | undefined) {
  return shown?.name === file.name && shown.image && isLocalPreview(shown.image)
    ? shown.image
    : undefined;
}

export function SentAttachments({
  artifactsPath,
  attachments,
  previews,
}: {
  artifactsPath: string;
  attachments: MessageAttachment[];
  previews?: MessageAttachment[];
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
              preview={previewOf(file, previews?.[index])}
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
