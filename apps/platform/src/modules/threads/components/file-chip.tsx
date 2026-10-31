import { File as FileIcon, X } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { fileSize } from "@/lib/format";

// A file attached to a message, by its name and size, with a remove button while it is pending.
export function FileChip({
  name,
  size,
  onRemove,
}: {
  name: string;
  size: number;
  onRemove?: () => void;
}) {
  return (
    <div className="flex h-14 max-w-56 items-center gap-2 rounded-lg border bg-card px-2.5 text-xs">
      <FileIcon className="size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium" title={name}>
          {name}
        </span>
        <span className="text-muted-foreground">{fileSize(size)}</span>
      </div>
      {onRemove && (
        <Button variant="ghost" size="icon-xs" aria-label={`Remove ${name}`} onClick={onRemove}>
          <X />
        </Button>
      )}
    </div>
  );
}
