import { Dots, Edit, Trash } from "@mynaui/icons-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";

type Props = {
  name: string;
  onRename: () => void;
  onDelete: () => void;
};

export function FolderMenu({ name, onRename, onDelete }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Folder options for ${name}`}
        className="absolute right-1 hidden size-6 items-center justify-center rounded-md text-muted-foreground outline-hidden group-focus-within/folder:flex group-hover/folder:flex hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-popup-open:flex max-md:flex"
      >
        <Dots className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={onRename}>
          <Edit />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash />
          Delete folder
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
