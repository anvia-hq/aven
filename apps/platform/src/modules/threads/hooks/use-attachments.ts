import { useEffect, useRef, useState } from "react";
import { ATTACHMENT_LIMITS } from "@aven/protocol/events";
import { ARTIFACT_MEDIA_TYPES } from "@aven/protocol/runtime-wire";

import { toast } from "@aven/ui/toast";
import { fileSize } from "@/lib/format";

import {
  forgetDraftFile,
  forgetDraftFiles,
  mergeDraftFiles,
  readDraftFiles,
  storeDraftFile,
  sweepDraftFiles,
} from "../drafts";
import type { AttachmentUpload, PendingFile } from "../types";

const MODEL_IMAGES = new Set<string>(
  ARTIFACT_MEDIA_TYPES.filter((mediaType) => mediaType.startsWith("image/")),
);

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

function previewOf(file: File) {
  return MODEL_IMAGES.has(file.type) ? URL.createObjectURL(file) : undefined;
}

export function useAttachments(threadId?: string) {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [restored, setRestored] = useState(threadId === undefined);
  const previews = useRef(new Set<string>());
  const removed = useRef(new Set<string>());
  const cleared = useRef(false);
  const warned = useRef(false);

  useEffect(() => {
    const made = previews.current;
    return () => {
      for (const url of made) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    if (threadId === undefined) {
      setRestored(true);
      return;
    }

    let live = true;
    setRestored(false);
    removed.current.clear();
    cleared.current = false;
    setFiles((current) => (current.length === 0 ? current : []));

    for (const url of previews.current) URL.revokeObjectURL(url);
    previews.current.clear();

    void (async () => {
      await sweepDraftFiles();

      const stored = await readDraftFiles(threadId);

      if (!live) return;

      const restored = cleared.current
        ? []
        : stored.flatMap(({ id, file }) => {
            if (removed.current.has(id)) return [];

            const preview = previewOf(file);

            if (preview) previews.current.add(preview);

            return [{ id, file, preview }];
          });

      setFiles((current) => mergeDraftFiles(restored, current));
      setRestored(true);
    })();

    return () => {
      live = false;
    };
  }, [threadId]);

  const free = (file: PendingFile) => {
    if (!file.preview) return;

    URL.revokeObjectURL(file.preview);
    previews.current.delete(file.preview);
  };

  function keep(id: string, file: File) {
    if (threadId === undefined) return;

    void storeDraftFile(threadId, id, file).then((stored) => {
      if (stored || warned.current) return;

      warned.current = true;
      toast.add({
        title: "Attached files won't survive a reload",
        description: "This browser would not keep them.",
        type: "error",
      });
    });
  }

  function add(list: Iterable<File>) {
    const next = [...files];
    const added: PendingFile[] = [];
    let total = next.reduce((sum, { file }) => sum + file.size, 0);
    for (const file of list) {
      const refused = refusal(file, next.length, total);

      if (refused) {
        toast.add({ title: `${file.name} was not attached`, description: refused, type: "error" });
        continue;
      }

      total += file.size;
      const pending: PendingFile = { id: crypto.randomUUID(), file, preview: previewOf(file) };

      if (pending.preview) previews.current.add(pending.preview);

      next.push(pending);
      added.push(pending);
    }
    setFiles(next);

    for (const { id, file } of added) keep(id, file);
  }

  function remove(id: string) {
    const gone = files.find((file) => file.id === id);

    if (gone) free(gone);

    setFiles(files.filter((file) => file.id !== id));
    removed.current.add(id);

    if (threadId !== undefined) void forgetDraftFile(threadId, id);
  }

  function clear() {
    files.forEach(free);
    setFiles([]);
    cleared.current = true;

    if (threadId !== undefined) void forgetDraftFiles(threadId);
  }

  const encode = () =>
    Promise.all(
      files.map(async ({ file }): Promise<AttachmentUpload> => ({
        name: file.name,
        mediaType: file.type || undefined,
        data: await readBase64(file),
      })),
    );

  return { files, restored, add, remove, clear, encode };
}
