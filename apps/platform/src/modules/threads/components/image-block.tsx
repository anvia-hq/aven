import { useState } from "react";
import { Image as ImageIcon, Refresh } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/dialog";

import type { ToolImage } from "../types";

// An image the agent showed (decision 0033). The runner keeps a copy outside the sandbox, so it
// loads after the sandbox is released; it fails only while the runner is offline, and says so.
export function ImageBlock({ threadId, image }: { threadId: string; image: ToolImage }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const alt = image.caption ?? "Image shown by the agent";
  const src = `/api/threads/${threadId}/artifacts/${image.name}`;

  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      {failed ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <ImageIcon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            Image unavailable. The runner that keeps it may be offline.
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFailed(false);
              setAttempt((count) => count + 1);
            }}
          >
            <Refresh className="size-4" />
            Retry
          </Button>
        </div>
      ) : (
        <Dialog>
          <DialogTrigger
            aria-label="Open image"
            className="w-fit max-w-full cursor-zoom-in rounded-lg text-left"
          >
            <img
              src={attempt === 0 ? src : `${src}?attempt=${attempt}`}
              alt={alt}
              loading="lazy"
              onError={() => setFailed(true)}
              className="max-h-[32rem] max-w-full rounded-lg border bg-muted/30 object-contain"
            />
          </DialogTrigger>
          <DialogContent className="w-fit max-w-[calc(100%-2rem)] gap-0 p-2 sm:max-w-[min(72rem,calc(100%-4rem))]">
            <DialogTitle className="sr-only">{alt}</DialogTitle>
            <img
              src={src}
              alt={alt}
              className="max-h-[85vh] max-w-full rounded-lg object-contain"
            />
          </DialogContent>
        </Dialog>
      )}
      {image.caption && (
        <figcaption className="text-xs text-muted-foreground">{image.caption}</figcaption>
      )}
    </figure>
  );
}
