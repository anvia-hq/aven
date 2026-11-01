import { Check, Cog } from "@mynaui/icons-react";
import { useNavigate } from "@tanstack/react-router";

import { Avatar, AvatarFallback } from "@/components/avatar";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/dropdown-menu";
import { initials } from "@/lib/format";

import { useOrganizations } from "../hooks/use-organizations";

// The organization block at the top of the account menu. Renders inside a DropdownMenuContent.
export function OrganizationMenu() {
  const navigate = useNavigate();
  const { organizations, activeOrganization, switchTo } = useOrganizations();
  const name = activeOrganization?.name ?? "No organization";
  const memberCount = activeOrganization?.members.length ?? 0;

  return (
    <>
      <div className="flex gap-3 p-2">
        <Avatar>
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
        <div className="grid min-w-0 flex-1 text-sm leading-tight">
          <span className="truncate font-medium">{name}</span>
          <span className="truncate text-xs text-muted-foreground">
            Organization • {memberCount} {memberCount === 1 ? "member" : "members"}
          </span>
        </div>
      </div>
      {/* An item, not a button, so the menu closes when it is chosen, also on a settings page. */}
      <DropdownMenuItem
        className="mx-2 mb-2 h-8 justify-center border border-border bg-background px-2.5 font-medium focus:bg-muted"
        onClick={() => navigate({ to: "/settings/members" })}
      >
        <Cog /> Settings
      </DropdownMenuItem>
      {organizations.length > 1 && (
        <>
          <DropdownMenuSeparator />
          {organizations.map((organization) => (
            <DropdownMenuItem key={organization.id} onClick={() => switchTo(organization.id)}>
              <span className="flex-1 truncate">{organization.name}</span>
              {organization.id === activeOrganization?.id && <Check />}
            </DropdownMenuItem>
          ))}
        </>
      )}
      <DropdownMenuSeparator />
    </>
  );
}
