import { ChevronsUpDown, Cog, Command, Logout } from "@mynaui/icons-react";
import { useNavigate } from "@tanstack/react-router";

import { Avatar, AvatarFallback } from "@/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/sidebar";
import { initials } from "@/lib/format";
import { OrganizationMenu } from "@/modules/organizations/components/organization-menu";
import { useCommandMenu } from "@/modules/navigation/hooks/use-command-menu";

type Props = {
  name: string;
  onSignOut: () => void;
};

export function UserCard({ name, onSignOut }: Props) {
  const navigate = useNavigate();
  const { setOpen: setCommandOpen } = useCommandMenu();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="sm" />}>
            <Avatar size="sm">
              <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground">
                {initials(name)}
              </AvatarFallback>
            </Avatar>
            <span className="flex-1 truncate text-left text-xs font-medium">{name}</span>
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="start" className="w-76 p-2">
            <OrganizationMenu />
            <DropdownMenuItem onClick={() => navigate({ to: "/settings/general" })}>
              <Cog /> Personal settings
              <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setCommandOpen(true)}>
              <Command /> Command palette
              <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut}>
              <Logout /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
