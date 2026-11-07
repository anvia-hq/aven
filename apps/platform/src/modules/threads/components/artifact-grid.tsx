import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Image as ImageIcon, Refresh } from "@mynaui/icons-react";
import { cn } from "cn";

import { Button } from "@/components/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/dialog";

import type { ToolArtifact } from "../types";

const isVideo = (artifact: ToolArtifact) => artifact.mediaType.startsWith("video/");
const sourceOf = (threadId: string, artifact: ToolArtifact) =>
  `/api/threads/${threadId}/artifacts/${artifact.name}`;
const labelOf = (artifact: ToolArtifact) =>
  artifact.caption ?? (isVideo(artifact) ? "Video shown by the agent" : "Image shown by the agent");

// A file that did not load: the runner that keeps it may be offline. Says so, with a retry.
function Unavailable({ video, onRetry }: { video: boolean; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
      <ImageIcon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        {video ? "Video" : "Image"} unavailable. The runner that keeps it may be offline.
      </span>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        <Refresh className="size-4" />
        Retry
      </Button>
    </div>
  );
}

// One artifact in the grid: an image that opens in the viewer, or a video that plays where it is.
// `single` is an artifact shown on its own, which is as large as the conversation allows; in a grid
// each is a tile of the same shape.
function Tile({
  threadId,
  artifact,
  single,
  onOpen,
}: {
  threadId: string;
  artifact: ToolArtifact;
  single: boolean;
  onOpen: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const base = sourceOf(threadId, artifact);
  const src = attempt === 0 ? base : `${base}?attempt=${attempt}`;
  const video = isVideo(artifact);
  const retry = () => {
    setFailed(false);
    setAttempt((count) => count + 1);
  };

  let media;
  if (failed) {
    media = <Unavailable video={video} onRetry={retry} />;
  } else if (video) {
    media = (
      <video
        src={src}
        controls
        preload="metadata"
        playsInline
        aria-label={labelOf(artifact)}
        onError={() => setFailed(true)}
        className={cn(
          "rounded-lg border bg-black object-contain",
          single ? "max-h-[32rem] w-fit max-w-full" : "aspect-video w-full",
        )}
      />
    );
  } else {
    media = (
      <Button
        variant="ghost"
        aria-label={`Open ${labelOf(artifact)}`}
        onClick={onOpen}
        className="h-auto w-fit max-w-full min-w-0 cursor-zoom-in justify-start rounded-lg p-0 hover:bg-transparent"
      >
        <img
          src={src}
          alt={labelOf(artifact)}
          loading="lazy"
          onError={() => setFailed(true)}
          className={cn(
            "rounded-lg border bg-muted/30",
            single ? "max-h-[32rem] max-w-full object-contain" : "aspect-video w-full object-cover",
          )}
        />
      </Button>
    );
  }

  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      {media}
      {artifact.caption && (
        <figcaption className="text-xs text-muted-foreground">{artifact.caption}</figcaption>
      )}
    </figure>
  );
}

// The images of a grid, full size, one at a time, with the arrow keys and buttons to go between.
function Viewer({
  threadId,
  images,
  index,
  onIndex,
  onClose,
}: {
  threadId: string;
  images: ToolArtifact[];
  index: number | null;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const open = index !== null;
  const current = open ? images[index] : undefined;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") onIndex((index + images.length - 1) % images.length);
      if (event.key === "ArrowRight") onIndex((index + 1) % images.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, images.length, onIndex]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-fit max-w-[calc(100%-2rem)] gap-0 p-2 sm:max-w-[min(72rem,calc(100%-4rem))]">
        <DialogTitle className="sr-only">{current ? labelOf(current) : "Image"}</DialogTitle>
        {current && (
          <img
            src={sourceOf(threadId, current)}
            alt={labelOf(current)}
            className="max-h-[85vh] max-w-full rounded-lg object-contain"
          />
        )}
        {open && images.length > 1 && (
          <div className="flex items-center justify-between gap-2 pt-2 text-xs text-muted-foreground">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous"
              onClick={() => onIndex((index + images.length - 1) % images.length)}
            >
              <ChevronLeft />
            </Button>
            <span className="tabular-nums">
              {index + 1} of {images.length}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next"
              onClick={() => onIndex((index + 1) % images.length)}
            >
              <ChevronRight />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// What the agent showed with one call (decisions 0033 and 0136): one file as large as it fits, or
// several together as a grid of equal tiles. The runner keeps a copy outside the sandbox, so they load
// after the sandbox is released; they fail only while the runner is offline, and say so.
export function ArtifactGrid({
  threadId,
  artifacts,
}: {
  threadId: string;
  artifacts: ToolArtifact[];
}) {
  const [viewing, setViewing] = useState<number | null>(null);
  // The viewer goes between the images; a video plays in its tile.
  const images = artifacts.filter((artifact) => !isVideo(artifact));
  const single = artifacts.length === 1;

  return (
    <>
      <div
        className={cn(
          "grid min-w-0 gap-3",
          !single && "grid-cols-2",
          artifacts.length > 2 && "sm:grid-cols-3",
        )}
      >
        {artifacts.map((artifact) => (
          <Tile
            key={artifact.name}
            threadId={threadId}
            artifact={artifact}
            single={single}
            onOpen={() => setViewing(images.indexOf(artifact))}
          />
        ))}
      </div>
      <Viewer
        threadId={threadId}
        images={images}
        index={viewing}
        onIndex={setViewing}
        onClose={() => setViewing(null)}
      />
    </>
  );
}
