import { useState, type ClipboardEvent, type DragEvent } from "react";

import type { useAttachments } from "./use-attachments";

export function useAttachmentDrop(attachments: ReturnType<typeof useAttachments>) {
  const [dragging, setDragging] = useState(false);

  return {
    "data-dragging": dragging || undefined,
    onDragOver(event: DragEvent<HTMLDivElement>) {
      if (!event.dataTransfer.types.includes("Files")) return;

      event.preventDefault();
      setDragging(true);
    },
    onDragLeave(event: DragEvent<HTMLDivElement>) {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
    },
    onDropCapture(event: DragEvent<HTMLDivElement>) {
      setDragging(false);

      if (event.dataTransfer.files.length === 0) return;

      event.preventDefault();
      event.stopPropagation();
      attachments.add(event.dataTransfer.files);
    },
    onPasteCapture(event: ClipboardEvent<HTMLDivElement>) {
      if (event.clipboardData.files.length === 0) return;

      event.preventDefault();
      event.stopPropagation();
      attachments.add(event.clipboardData.files);
    },
  };
}
