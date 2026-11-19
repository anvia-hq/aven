import { IconArchive, IconDots } from "@tabler/icons-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aven/ui/dropdown-menu";
import { SidebarMenuAction } from "@aven/ui/sidebar";

type Props = { title: string; onArchive: () => void };

export function ThreadActionsMenu({ title, onArchive }: Props) {
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
        <IconDots />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem onClick={onArchive}>
          <IconArchive />
          Archive
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
