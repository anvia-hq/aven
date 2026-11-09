import { useState } from "react";
import { Maximize, Refresh } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/dialog";

import { useArtifactFrame } from "../hooks/use-artifact-frame";

const SANDBOX = "allow-scripts";

function Frame({ src, label, fill }: { src: string; label: string; fill?: boolean }) {
  const { frame, height, failed, attempt, retry } = useArtifactFrame();
  if (failed) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
        <span className="min-w-0 flex-1">
          Page unavailable. The runner that keeps it may be offline.
        </span>
        <Button variant="ghost" size="sm" onClick={retry}>
          <Refresh className="size-4" />
          Retry
        </Button>
      </div>
    );
  }
  return (
    <iframe
      key={attempt}
      ref={frame}
      src={attempt === 0 ? src : `${src}?attempt=${attempt}`}
      title={label}
      sandbox={SANDBOX}
      referrerPolicy="no-referrer"
      style={fill ? undefined : { height }}
      className={fill ? "size-full border-0" : "block w-full border-0"}
    />
  );
}

export function ArtifactFrame({
  src,
  label,
  caption,
}: {
  src: string;
  label: string;
  caption?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <figure className="group relative flex min-w-0 flex-col gap-1.5" data-role="artifact-page">
      <Frame src={src} label={label} />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Expand ${label}`}
        onClick={() => setExpanded(true)}
        className="absolute top-1 right-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Maximize />
      </Button>
      {caption && <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="h-[85vh] w-[90vw] max-w-[90vw] gap-0 p-2 sm:max-w-[90vw]">
          <DialogTitle className="sr-only">{label}</DialogTitle>
          {expanded && <Frame src={src} label={label} fill />}
        </DialogContent>
      </Dialog>
    </figure>
  );
}
