import { ChevronRight, FolderOne } from "@mynaui/icons-react";

import { FolderNameField } from "./folder-name-field";

export function NewFolderRow({ onDone }: { onDone: (name?: string) => void }) {
  return (
    <div data-slot="new-folder" className="my-0.5 flex h-8 items-center gap-1.5 pr-2 pl-1">
      <ChevronRight className="size-4 shrink-0 rotate-90" />
      <FolderOne className="size-4 shrink-0 text-muted-foreground" />
      <FolderNameField initial="New folder" onDone={onDone} />
    </div>
  );
}
