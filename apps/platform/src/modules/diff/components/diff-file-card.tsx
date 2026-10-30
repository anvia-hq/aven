import { ChevronRight } from "@mynaui/icons-react";

import { Badge } from "@/components/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/collapsible";

import type { DiffFile, DiffLayout } from "../types";
import { DiffLines } from "./diff-lines";

// A file with this many changed lines starts folded, so one huge change does not bury the rest.
const FOLD_ABOVE = 400;

const statusLabel: Record<DiffFile["status"], string | null> = {
  added: "New",
  deleted: "Deleted",
  renamed: "Renamed",
  modified: null,
};

export function DiffFileCard({ file, layout }: { file: DiffFile; layout: DiffLayout }) {
  const label = statusLabel[file.status];
  const body = file.hunks.length > 0;
  return (
    <Collapsible
      defaultOpen={file.additions + file.deletions <= FOLD_ABOVE}
      className="overflow-hidden rounded-lg border bg-card"
    >
      <CollapsibleTrigger className="group/file flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/50">
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-panel-open/file:rotate-90" />
        <span className="min-w-0 flex-1 truncate font-mono" title={file.path}>
          {file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
        </span>
        {label && <Badge variant="secondary">{label}</Badge>}
        {file.additions > 0 && <span className="text-success">+{file.additions}</span>}
        {file.deletions > 0 && <span className="text-destructive">-{file.deletions}</span>}
      </CollapsibleTrigger>
      <CollapsibleContent>
        {body ? (
          <DiffLines hunks={file.hunks} layout={layout} />
        ) : (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            {file.binary ? "Binary file changed." : "Only the file's mode or name changed."}
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
