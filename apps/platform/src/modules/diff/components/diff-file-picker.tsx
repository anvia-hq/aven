import { IconChevronDown } from "@tabler/icons-react";
import { useState } from "react";

import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@aven/ui/popover";

import type { DiffFile } from "../types";
import { DiffStat } from "./diff-stat";

type Props = {
  files: DiffFile[];
  additions: number;
  deletions: number;
  onSelect: (path: string) => void;
};

const statusTag: Record<DiffFile["status"], string | null> = {
  added: "New",
  deleted: "Deleted",
  renamed: "Renamed",
  modified: null,
};

export function DiffFilePicker({ files, additions, deletions, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const counted = additions > 0 || deletions > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label="Jump to changed file"
            className="h-7 min-w-0 max-w-full justify-start gap-1.5 px-2 text-xs font-normal text-muted-foreground"
          />
        }
      >
        <span className="truncate">
          {files.length} {files.length === 1 ? "file" : "files"}{" "}
          {counted && <DiffStat additions={additions} deletions={deletions} />}
        </span>
        <IconChevronDown className="size-3.5 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] gap-1 p-1.5">
        <div className="max-h-72 overflow-y-auto">
          {files.map((file) => {
            const tag = statusTag[file.status];
            return (
              <Button
                key={file.path}
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  onSelect(file.path);
                }}
                className="h-auto w-full justify-start gap-2 px-2 py-1.5 text-left text-xs font-normal"
              >
                <span className="min-w-0 flex-1 truncate font-mono" title={file.path}>
                  {file.path}
                </span>
                {tag && <Badge variant="secondary">{tag}</Badge>}
                <DiffStat additions={file.additions} deletions={file.deletions} hideZeros />
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
