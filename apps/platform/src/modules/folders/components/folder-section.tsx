import { ChevronRight, Folder as FolderIcon, FolderOne } from "@mynaui/icons-react";
import { cn } from "cn";
import { useState, type DragEvent, type ReactNode } from "react";

import { Button } from "@aven/ui/button";
import { dragsThread, THREAD_DRAG } from "@/lib/thread-drag";

import { isTempId } from "../folder-cache";
import type { FolderGroup } from "../types";
import { FolderMenu } from "./folder-menu";
import { FolderNameField } from "./folder-name-field";

type Props = {
  group: FolderGroup;
  editing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onRenamed: (name?: string) => void;
  onDelete: () => void;
  onDropThread: (threadId: string) => void;
  children: ReactNode;
};

export function FolderSection({
  group,
  editing,
  onToggle,
  onEdit,
  onRenamed,
  onDelete,
  onDropThread,
  children,
}: Props) {
  const { folder, threads } = group;
  const [over, setOver] = useState(false);
  const pending = isTempId(folder.id);
  const Icon = folder.open ? FolderOne : FolderIcon;

  const accepts = (event: DragEvent) => !pending && dragsThread(event);

  return (
    <div
      data-slot="folder"
      data-folder={folder.name}
      data-open={folder.open}
      data-pending={pending}
      data-over={over}
      className={cn(
        "group/folder my-0.5 rounded-lg",
        over &&
          "bg-primary/10 outline-[1.5px] -outline-offset-[1.5px] outline-primary outline-dashed",
      )}
      onDragOver={(event) => {
        if (!accepts(event)) return;

        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(event) => {
        if (!accepts(event)) return;

        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        onDropThread(event.dataTransfer.getData(THREAD_DRAG));
      }}
    >
      <div className="relative flex h-8 items-center rounded-lg hover:bg-sidebar-accent">
        {editing ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 pr-2 pl-1">
            <ChevronRight className={cn("size-4 shrink-0", folder.open && "rotate-90")} />
            <Icon className="mx-0.5 size-4 shrink-0 text-muted-foreground" />
            <FolderNameField initial={folder.name} onDone={onRenamed} />
          </div>
        ) : (
          <Button
            variant="ghost"
            data-slot="folder-toggle"
            aria-expanded={folder.open}
            className="h-full min-w-0 flex-1 justify-start gap-1.5 rounded-lg pr-10 pl-1 text-left text-sm font-medium hover:bg-transparent aria-expanded:bg-transparent"
            onClick={pending ? undefined : onToggle}
            onDoubleClick={pending ? undefined : onEdit}
          >
            <ChevronRight
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                folder.open && "rotate-90",
              )}
            />
            <Icon
              className={cn(
                "mx-0.5 size-4 shrink-0",
                over ? "text-primary" : "text-muted-foreground",
              )}
            />
            <span className="min-w-0 flex-1 truncate">{folder.name}</span>
          </Button>
        )}
        {!editing && (
          <>
            <span
              data-slot="folder-count"
              aria-label={`${threads.length} threads`}
              className="pointer-events-none absolute right-2 text-xs text-muted-foreground tabular-nums group-focus-within/folder:hidden group-hover/folder:hidden group-has-data-popup-open/folder:hidden max-md:hidden"
            >
              {threads.length}
            </span>
            {!pending && <FolderMenu name={folder.name} onRename={onEdit} onDelete={onDelete} />}
          </>
        )}
      </div>
      {folder.open && (
        <div className="ml-3.5 border-l border-sidebar-border pl-1">
          {threads.length > 0 ? (
            children
          ) : (
            <p className="px-2 py-1.5 text-xs text-muted-foreground italic">Drop threads here</p>
          )}
        </div>
      )}
    </div>
  );
}
