import { Bug, ChevronsUpDown, Cog, Command, Logout, Users } from "@mynaui/icons-react";
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
import { toast } from "@/components/toast";
import { initials } from "@/lib/format";
import { useCommandMenu } from "@/modules/navigation/hooks/use-command-menu";

type Props = {
  name: string;
  email: string;
  onSignOut: () => void;
};

export function UserCard({ name, email, onSignOut }: Props) {
  const navigate = useNavigate();
  const { setOpen: setCommandOpen } = useCommandMenu();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
            <Avatar>
              <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground">
                {initials(name)}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{name}</span>
              <span className="truncate text-xs text-sidebar-foreground/70">{email}</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-64">
            <DropdownMenuItem onClick={() => navigate({ to: "/settings/profile" })}>
              <Cog /> Personal settings
              <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate({ to: "/settings/members" })}>
              <Users /> Workspace settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setCommandOpen(true)}>
              <Command /> Command palette
              <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast.add({ title: "Thanks! Bug report is a mock." })}>
              <Bug /> Report a bug…
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
