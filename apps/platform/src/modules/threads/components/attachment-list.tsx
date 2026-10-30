import { useState } from "react";
import { File as FileIcon, X } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { fileSize } from "@/lib/format";

import type { PendingFile } from "../hooks/use-attachments";
import type { MessageAttachment } from "../types";

function FileChip({ name, size, onRemove }: { name: string; size: number; onRemove?: () => void }) {
  return (
    <div className="flex h-14 max-w-56 items-center gap-2 rounded-lg border bg-card px-2.5 text-xs">
      <FileIcon className="size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium" title={name}>
          {name}
        </span>
        <span className="text-muted-foreground">{fileSize(size)}</span>
      </div>
      {onRemove && (
        <Button variant="ghost" size="icon-xs" aria-label={`Remove ${name}`} onClick={onRemove}>
          <X />
        </Button>
      )}
    </div>
  );
}

// The files picked in the composer, before they are sent.
export function PendingAttachments({
  files,
  onRemove,
}: {
  files: PendingFile[];
  onRemove: (id: string) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 p-1">
      {files.map(({ id, file, preview }) =>
        preview ? (
          <div key={id} className="relative size-14">
            <img src={preview} alt={file.name} className="size-14 rounded-lg border object-cover" />
            <Button
              variant="secondary"
              size="icon-xs"
              aria-label={`Remove ${file.name}`}
              className="absolute -top-1.5 -right-1.5 rounded-full"
              onClick={() => onRemove(id)}
            >
              <X />
            </Button>
          </div>
        ) : (
          <FileChip key={id} name={file.name} size={file.size} onRemove={() => onRemove(id)} />
        ),
      )}
    </div>
  );
}

// A just-sent image is in the transcript a moment before the runner has kept its copy.
const RETRY_DELAYS_MS = [500, 1_500, 4_000];

// An image sent with a message, from the copy the runner keeps; a chip when it cannot be loaded.
function SentImage({ threadId, file }: { threadId: string; file: MessageAttachment }) {
  const [attempt, setAttempt] = useState(0);
  const failed = attempt > RETRY_DELAYS_MS.length;
  if (failed || !file.image) return <FileChip name={file.name} size={file.size} />;
  const src = `/api/threads/${threadId}/artifacts/${file.image}`;
  const retry = () => {
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined) setAttempt((count) => count + 1);
    else setTimeout(() => setAttempt((count) => count + 1), delay);
  };
  return (
    <a href={src} target="_blank" rel="noreferrer" title={file.name}>
      <img
        src={attempt === 0 ? src : `${src}?attempt=${attempt}`}
        alt={file.name}
        loading="lazy"
        onError={retry}
        className="max-h-40 max-w-60 rounded-lg border bg-muted/30 object-contain"
      />
    </a>
  );
}

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
