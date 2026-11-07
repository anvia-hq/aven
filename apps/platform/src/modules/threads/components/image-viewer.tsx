import { ChevronLeft, ChevronRight } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/dialog";

import type { ViewerImage } from "../types";

export function ImageViewer({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: ViewerImage[];
  index: number | null;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const open = index !== null;
  const current = open ? images[index] : undefined;

  const step = (by: number) => {
    if (open) onIndex((index + by + images.length) % images.length);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="flex h-[80vh] w-[80vw] max-w-[80vw] flex-col gap-0 p-2 sm:max-w-[80vw]"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") step(-1);
          if (event.key === "ArrowRight") step(1);
        }}
      >
        <DialogTitle className="sr-only">{current?.label ?? "Image"}</DialogTitle>
        {current && (
          <img
            src={current.src}
            alt={current.label}
            className="min-h-0 w-full flex-1 rounded-lg object-contain"
          />
        )}
        {open && images.length > 1 && (
          <div className="flex items-center justify-between gap-2 pt-2 text-xs text-muted-foreground">
            <Button variant="ghost" size="icon-sm" aria-label="Previous" onClick={() => step(-1)}>
              <ChevronLeft />
            </Button>
            <span className="tabular-nums">
              {index + 1} of {images.length}
            </span>
            <Button variant="ghost" size="icon-sm" aria-label="Next" onClick={() => step(1)}>
              <ChevronRight />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
