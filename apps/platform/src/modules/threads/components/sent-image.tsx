import { useEffect, useState } from "react";

import { Button } from "@aven/ui/button";

import { isLocalPreview } from "../pending-messages";
import type { MessageAttachment } from "../types";
import { FileChip } from "./file-chip";

const RETRY_DELAYS_MS = [500, 1_500, 4_000];

function useArtifactReady(src: string, enabled: boolean) {
  const [ready, setReady] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const probe = (attempt: number) => {
      const url = attempt === 0 ? src : `${src}?attempt=${attempt}`;
      const image = new Image();
      image.onload = () => {
        if (!cancelled) setReady(url);
      };
      image.onerror = () => {
        const delay = RETRY_DELAYS_MS[attempt];

        if (!cancelled && delay !== undefined) timer = setTimeout(() => probe(attempt + 1), delay);
      };
      image.src = url;
    };
    probe(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [src, enabled]);

  return ready;
}

export function SentImage({
  artifactsPath,
  file,
  preview,
  onOpen,
}: {
  artifactsPath: string;
  file: MessageAttachment;
  preview?: string;
  onOpen: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const local = file.image !== undefined && isLocalPreview(file.image);
  const remote = file.image && !local ? `${artifactsPath}/${file.image}` : "";
  const ready = useArtifactReady(remote, preview !== undefined && remote !== "");
  const failed = attempt > RETRY_DELAYS_MS.length;

  if (!file.image || (failed && preview === undefined)) {
    return <FileChip name={file.name} size={file.size} />;
  }

  const held = preview !== undefined && ready === null;
  let src = ready ?? remote;

  if (held) src = preview;
  else if (local) src = file.image;

  const retry = () => {
    const delay = RETRY_DELAYS_MS[attempt];

    if (delay === undefined) setAttempt((count) => count + 1);
    else setTimeout(() => setAttempt((count) => count + 1), delay);
  };
  const retrying = !local && !held && preview === undefined && attempt > 0;
  return (
    <Button
      variant="ghost"
      aria-label={`Open ${file.name}`}
      title={file.name}
      onClick={onOpen}
      className="h-auto w-fit max-w-full min-w-0 cursor-zoom-in rounded-lg p-0 hover:bg-transparent"
    >
      <img
        src={retrying ? `${src}?attempt=${attempt}` : src}
        alt={file.name}
        loading={local || held ? "eager" : "lazy"}
        decoding={local || held ? "sync" : "async"}
        onError={local || held || preview !== undefined ? undefined : retry}
        className="max-h-40 max-w-60 rounded-lg border bg-muted/30 object-contain"
      />
    </Button>
  );
}
