import { Check, Cog } from "@mynaui/icons-react";
import { useNavigate } from "@tanstack/react-router";

import { Avatar, AvatarFallback } from "@/components/avatar";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/dropdown-menu";
import { initials } from "@/lib/format";

import { useOrganizations } from "../hooks/use-organizations";

export function OrganizationMenu() {
  const navigate = useNavigate();
  const { organizations, activeOrganization, switchTo } = useOrganizations();
  const name = activeOrganization?.name ?? "No organization";
  const memberCount = activeOrganization?.members.length ?? 0;

  return (
    <>
      <DropdownMenuItem
        aria-label={`Organization settings, ${name}, ${memberCount} ${memberCount === 1 ? "member" : "members"}`}
        className="h-12 gap-3 px-2"
        onClick={() => navigate({ to: "/settings/members" })}
      >
        <Avatar className="rounded-lg after:rounded-lg">
          <AvatarFallback className="rounded-lg bg-primary/15 text-xs font-semibold text-primary">
            {initials(name)}
          </AvatarFallback>
        </Avatar>
        <div className="grid min-w-0 flex-1 leading-tight">
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </span>
        </div>
        <Cog className="size-4 text-muted-foreground" />
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
    </>
  );
}
