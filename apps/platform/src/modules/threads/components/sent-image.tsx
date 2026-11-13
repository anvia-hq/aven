import { useState } from "react";

import { Button } from "@aven/ui/button";

import { isLocalPreview } from "../pending-messages";
import type { MessageAttachment } from "../types";
import { FileChip } from "./file-chip";

const RETRY_DELAYS_MS = [500, 1_500, 4_000];

export function SentImage({
  artifactsPath,
  file,
  onOpen,
}: {
  artifactsPath: string;
  file: MessageAttachment;
  onOpen: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const failed = attempt > RETRY_DELAYS_MS.length;

  if (failed || !file.image) return <FileChip name={file.name} size={file.size} />;

  const local = isLocalPreview(file.image);
  const src = local ? file.image : `${artifactsPath}/${file.image}`;
  const retry = () => {
    const delay = RETRY_DELAYS_MS[attempt];

    if (delay === undefined) setAttempt((count) => count + 1);
    else setTimeout(() => setAttempt((count) => count + 1), delay);
  };
  return (
    <Button
      variant="ghost"
      aria-label={`Open ${file.name}`}
      title={file.name}
      onClick={onOpen}
      className="h-auto w-fit max-w-full min-w-0 cursor-zoom-in rounded-lg p-0 hover:bg-transparent"
    >
      <img
        src={attempt === 0 || local ? src : `${src}?attempt=${attempt}`}
        alt={file.name}
        loading={local ? "eager" : "lazy"}
        decoding={local ? "sync" : "async"}
        onError={local ? undefined : retry}
        className="max-h-40 max-w-60 rounded-lg border bg-muted/30 object-contain"
      />
    </Button>
  );
}
