import { X } from "@mynaui/icons-react";

import { Button } from "@aven/ui/button";

import { FileChip } from "./file-chip";
import type { PendingFile } from "../types";

export function PendingAttachments({
  files,
  onRemove,
}: {
  files: PendingFile[];
  onRemove: (id: string) => void;
}) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 p-1">
      {files.map(({ id, file, preview }) =>
        preview ? (
          <div key={id} className="relative size-14">
            <img src={preview} alt={file.name} className="size-14 rounded-lg border object-cover" />
            <Button
              variant="secondary"
              size="icon-xs"
              aria-label={`Remove ${file.name}`}
              className="absolute -top-1.5 -right-1.5 rounded-full"
              onClick={() => onRemove(id)}
            >
              <X />
            </Button>
          </div>
        ) : (
          <FileChip key={id} name={file.name} size={file.size} onRemove={() => onRemove(id)} />
        ),
      )}
    </div>
  );
}
