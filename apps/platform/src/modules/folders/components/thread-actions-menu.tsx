import { Archive, Check, Dots, FolderMinus, FolderPlus, FolderOne } from "@mynaui/icons-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { SidebarMenuAction } from "@/components/sidebar";

import { isTempId } from "../folder-cache";
import type { Folder } from "../types";

type Props = {
  title: string;
  folders: Folder[];
  currentFolderId: string | undefined;
  onMove: (folderId: string | null) => void;
  onNewFolder: () => void;
  onArchive: () => void;
};

export function ThreadActionsMenu({
  title,
  folders,
  currentFolderId,
  onMove,
  onNewFolder,
  onArchive,
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuAction
            className="right-2 group-has-focus-visible/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-active/menu-button:text-sidebar-accent-foreground data-popup-open:opacity-100 md:opacity-0"
            aria-label={`Options for ${title}`}
            title="More"
          />
        }
      >
        <Dots />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FolderOne />
            Move to folder
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            {folders
              .filter((folder) => !isTempId(folder.id))
              .map((folder) => (
                <DropdownMenuItem key={folder.id} onClick={() => onMove(folder.id)}>
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                  {folder.id === currentFolderId && <Check />}
                </DropdownMenuItem>
              ))}
            {folders.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={onNewFolder}>
              <FolderPlus />
              New folder…
            </DropdownMenuItem>
            {currentFolderId !== undefined && (
              <DropdownMenuItem onClick={() => onMove(null)}>
                <FolderMinus />
                Remove from folder
              </DropdownMenuItem>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onClick={onArchive}>
          <Archive />
          Archive
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
