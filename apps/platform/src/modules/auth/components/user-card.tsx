import { IconCommand, IconLogout, IconSelector, IconUser } from "@tabler/icons-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@aven/ui/tooltip";
import { Button } from "@aven/ui/button";
import { initials } from "@/lib/format";
import { OrganizationMenu } from "@/modules/organizations/components/organization-menu";

type Props = {
  name: string;
  email?: string | null;
  image?: string | null;
  onSignOut: () => void;
  onOpenCommand: () => void;
};

function UserAvatar({ name, image }: Pick<Props, "name" | "image">) {
  return (
    <Avatar size="sm">
      {image && <AvatarImage src={image} alt="" />}
      <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

function UserMenuContent({
  name,
  email,
  image,
  onSignOut,
  onOpenCommand,
  side,
  align,
}: Props & { side: "top" | "right"; align: "start" | "end" }) {
  const navigate = useNavigate();

  return (
    <DropdownMenuContent side={side} align={align} sideOffset={10} className="w-76 p-2">
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
        <IconUser /> Personal settings
        <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onOpenCommand}>
        <IconCommand /> Command palette
        <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={onSignOut}>
        <IconLogout /> Sign out
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

export function UserCard(props: Props) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="sm" />}>
            <UserAvatar name={props.name} image={props.image} />
            <span className="flex-1 truncate text-left text-xs font-medium">{props.name}</span>
            <IconSelector className="ml-auto size-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <UserMenuContent {...props} side="top" align="start" />
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function RailAccount(props: Props) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  aria-label={`Account, ${props.name}`}
                  className="size-9 shrink-0 rounded-xl p-0 hover:bg-accent aria-expanded:bg-accent"
                />
              }
            />
          }
        >
          <UserAvatar name={props.name} image={props.image} />
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          {props.name}
        </TooltipContent>
      </Tooltip>
      <UserMenuContent {...props} side="right" align="end" />
    </DropdownMenu>
  );
}
