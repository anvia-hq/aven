import { useState } from "react";
import { Image as ImageIcon, Refresh } from "@mynaui/icons-react";
import { cn } from "cn";

import { Button } from "@/components/button";

import type { ToolArtifact } from "../types";
import { ArtifactFrame } from "./artifact-frame";
import { ImageViewer } from "./image-viewer";

const isPage = (artifact: ToolArtifact) => artifact.mediaType === "text/html";
const isVideo = (artifact: ToolArtifact) => artifact.mediaType.startsWith("video/");
const sourceOf = (threadId: string, artifact: ToolArtifact) =>
  `/api/threads/${threadId}/artifacts/${artifact.name}`;
function labelOf(artifact: ToolArtifact) {
  if (artifact.caption) return artifact.caption;

  if (isPage(artifact)) return "Page shown by the agent";

  return isVideo(artifact) ? "Video shown by the agent" : "Image shown by the agent";
}

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

export function ArtifactGrid({
  threadId,
  artifacts,
}: {
  threadId: string;
  artifacts: ToolArtifact[];
}) {
  const [viewing, setViewing] = useState<number | null>(null);
  const pages = artifacts.filter(isPage);
  const media = artifacts.filter((artifact) => !isPage(artifact));
  const images = media.filter((artifact) => !isVideo(artifact));
  const single = media.length === 1;

  return (
    <>
      {pages.map((artifact) => (
        <ArtifactFrame
          key={artifact.name}
          src={sourceOf(threadId, artifact)}
          label={labelOf(artifact)}
          caption={artifact.caption}
        />
      ))}
      {media.length > 0 && (
        <div
          className={cn(
            "grid min-w-0 gap-3",
            !single && "grid-cols-2",
            media.length > 2 && "sm:grid-cols-3",
          )}
        >
          {media.map((artifact) => (
            <Tile
              key={artifact.name}
              threadId={threadId}
              artifact={artifact}
              single={single}
              onOpen={() => setViewing(images.indexOf(artifact))}
            />
          ))}
        </div>
      )}
      <ImageViewer
        images={images.map((artifact) => ({
          src: sourceOf(threadId, artifact),
          label: labelOf(artifact),
        }))}
        index={viewing}
        onIndex={setViewing}
        onClose={() => setViewing(null)}
      />
    </>
  );
}
