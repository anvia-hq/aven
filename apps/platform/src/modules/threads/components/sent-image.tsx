import { useState } from "react";

import type { MessageAttachment } from "../types";
import { FileChip } from "./file-chip";

const RETRY_DELAYS_MS = [500, 1_500, 4_000];

export function SentImage({
  artifactsPath,
  file,
}: {
  artifactsPath: string;
  file: MessageAttachment;
}) {
  const [attempt, setAttempt] = useState(0);
  const failed = attempt > RETRY_DELAYS_MS.length;
  if (failed || !file.image) return <FileChip name={file.name} size={file.size} />;
  const src = `${artifactsPath}/${file.image}`;
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
