import { Check, FolderMinus, FolderPlus, FolderOne } from "@mynaui/icons-react";

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
};

export function MoveToFolderMenu({ title, folders, currentFolderId, onMove, onNewFolder }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuAction
            className="right-8 group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-active/menu-button:text-sidebar-accent-foreground md:opacity-0"
            aria-label={`Options for ${title}`}
            title="Move to folder"
          />
        }
      >
        <FolderOne />
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
