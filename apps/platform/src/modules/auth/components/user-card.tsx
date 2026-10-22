import { Logout } from "@mynaui/icons-react";

import { Avatar, AvatarFallback } from "@/components/avatar";
import { Button } from "@/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/popover";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/sidebar";

type Props = {
  name: string;
  email: string;
  onSignOut: () => void;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

export function UserCard({ name, email, onSignOut }: Props) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Popover>
          <PopoverTrigger render={<SidebarMenuButton size="lg" />}>
            <Avatar>
              <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground">
                {initials(name)}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{name}</span>
              <span className="truncate text-xs text-sidebar-foreground/70">{email}</span>
            </div>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-64">
            <div className="grid gap-0.5 px-1.5 py-1 text-sm">
              <span className="truncate font-medium">{name}</span>
              <span className="truncate text-xs text-muted-foreground">{email}</span>
            </div>
            <Button variant="ghost" className="justify-start" onClick={onSignOut}>
              <Logout />
              Sign out
            </Button>
          </PopoverContent>
        </Popover>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
