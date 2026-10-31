import { useEffect, useRef, useState } from "react";
import { ATTACHMENT_LIMITS } from "@aven/protocol/events";
import { ARTIFACT_MEDIA_TYPES } from "@aven/protocol/runtime-wire";

import { toast } from "@/components/toast";
import { fileSize } from "@/lib/format";

import type { AttachmentUpload } from "../types";

/** A file the composer will send; `preview` is an object URL for an image. */
export type PendingFile = { id: string; file: File; preview?: string };

// The images a model is shown; anything else, an SVG included, only goes to the sandbox.
const MODEL_IMAGES = new Set<string>(ARTIFACT_MEDIA_TYPES);

function readBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

// Why a file cannot join the ones already picked, or undefined when it can.
function refusal(file: File, count: number, total: number) {
  if (count >= ATTACHMENT_LIMITS.count) {
    return `A message can carry ${ATTACHMENT_LIMITS.count} files`;
  }
  if (total + file.size > ATTACHMENT_LIMITS.totalBytes) {
    return `The files of one message can add up to ${fileSize(ATTACHMENT_LIMITS.totalBytes)}`;
  }
  if (MODEL_IMAGES.has(file.type) && file.size > ATTACHMENT_LIMITS.imageBytes) {
    return `Images can be up to ${fileSize(ATTACHMENT_LIMITS.imageBytes)}`;
  }
  return undefined;
}

// The files the composer sends with its message (decision 0034). The limits are checked as a file
// is added, so one that cannot go is refused then and not on send; the control plane checks again.
export function useAttachments() {
  const [files, setFiles] = useState<PendingFile[]>([]);
  // Every preview made, freed when the composer goes.
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const made = previews.current;
    return () => {
      for (const url of made) URL.revokeObjectURL(url);
    };
  }, []);

  const free = (file: PendingFile) => {
    if (!file.preview) return;
    URL.revokeObjectURL(file.preview);
    previews.current.delete(file.preview);
  };

  function add(list: Iterable<File>) {
    const next = [...files];
    let total = next.reduce((sum, { file }) => sum + file.size, 0);
    for (const file of list) {
      const refused = refusal(file, next.length, total);
      if (refused) {
        toast.add({ title: `${file.name} was not attached`, description: refused, type: "error" });
        continue;
      }
      total += file.size;
      const preview = MODEL_IMAGES.has(file.type) ? URL.createObjectURL(file) : undefined;
      if (preview) previews.current.add(preview);
      next.push({ id: crypto.randomUUID(), file, preview });
    }
    setFiles(next);
  }

  function remove(id: string) {
    const gone = files.find((file) => file.id === id);
    if (gone) free(gone);
    setFiles(files.filter((file) => file.id !== id));
  }

  function clear() {
    files.forEach(free);
    setFiles([]);
  }

  // The files as the message sends them.
  const encode = () =>
    Promise.all(
      files.map(async ({ file }): Promise<AttachmentUpload> => ({
        name: file.name,
        mediaType: file.type || undefined,
        data: await readBase64(file),
      })),
    );

  return { files, add, remove, clear, encode };
}
