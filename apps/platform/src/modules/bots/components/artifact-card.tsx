import { File as FileIcon, FileText, Image as ImageIcon } from "@mynaui/icons-react";
import { cn } from "cn";

import { Button } from "@/components/button";
import { fileSize } from "@/lib/format";

import { kindOf } from "../artifacts";
import type { ArtifactFile } from "../types";

const LABELS = {
  pdf: "PDF",
  markdown: "Markdown",
  csv: "CSV",
  text: "Text",
  page: "Page",
  image: "Image",
  video: "Video",
} as const;

const ICONS = {
  pdf: FileIcon,
  page: FileIcon,
  image: ImageIcon,
  video: FileIcon,
  markdown: FileText,
  csv: FileText,
  text: FileText,
} as const;

export function ArtifactCard({
  artifact,
  active,
  onOpen,
}: {
  artifact: ArtifactFile;
  active: boolean;
  onOpen: () => void;
}) {
  const kind = kindOf(artifact.mediaType);
  const Icon = ICONS[kind];

  return (
    <Button
      type="button"
      variant="ghost"
      data-role="artifact-card"
      aria-label={`Open ${artifact.title}`}
      aria-pressed={active}
      onClick={onOpen}
      className={cn(
        "h-auto w-72 max-w-full justify-start gap-3 rounded-xl border bg-card px-3 py-2.5 text-left text-sm font-normal transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        active && "border-ring bg-accent",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{artifact.title}</span>
        <span className="text-xs text-muted-foreground">
          {LABELS[kind]}
          {artifact.size !== undefined && ` · ${fileSize(artifact.size)}`}
        </span>
      </span>
    </Button>
  );
}
