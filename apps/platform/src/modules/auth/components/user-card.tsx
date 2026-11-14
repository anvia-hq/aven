import { ChevronsUpDown, Command, Logout, User } from "@mynaui/icons-react";
import { useNavigate } from "@tanstack/react-router";

import { Avatar, AvatarFallback, AvatarImage } from "@aven/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@aven/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@aven/ui/sidebar";
import { initials } from "@/lib/format";
import { OrganizationMenu } from "@/modules/organizations/components/organization-menu";
import { useCommandMenu } from "@/modules/navigation/hooks/use-command-menu";

type Props = {
  name: string;
  email?: string | null;
  image?: string | null;
  onSignOut: () => void;
};

export function UserCard({ name, email, image, onSignOut }: Props) {
  const navigate = useNavigate();
  const { setOpen: setCommandOpen } = useCommandMenu();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="sm" />}>
            <Avatar size="sm">
              {image && <AvatarImage src={image} alt="" />}
              <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground">
                {initials(name)}
              </AvatarFallback>
            </Avatar>
            <span className="flex-1 truncate text-left text-xs font-medium">{name}</span>
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="start" className="w-76 p-2">
            <div className="flex items-center gap-3 px-2 py-1.5">
              <Avatar>
                {image && <AvatarImage src={image} alt="" />}
                <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground">
                  {initials(name)}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-sm font-medium">{name}</span>
                {email && <span className="truncate text-xs text-muted-foreground">{email}</span>}
              </div>
            </div>
            <DropdownMenuSeparator />
            <OrganizationMenu />
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: "/settings/general" })}>
              <User /> Personal settings
              <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCommandOpen(true)}>
              <Command /> Command palette
              <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onSignOut}>
              <Logout /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
