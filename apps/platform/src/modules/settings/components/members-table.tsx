import { Copy, Trash } from "@mynaui/icons-react";

import { Avatar, AvatarFallback, AvatarImage } from "@aven/ui/avatar";
import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import { SettingsList, SettingsRow } from "@/components/settings-section";
import { initials } from "@/lib/format";

import { useMembers } from "../hooks/use-members";
import { ROLE_LABELS } from "../types";

export function MembersTable() {
  const { members, copyLink, remove } = useMembers();

  return (
    <SettingsList label="Members">
      {members.map((member) => (
        <div key={member.id} role="listitem" className="contents">
          <SettingsRow
            leading={
              <Avatar size="sm">
                {member.image && <AvatarImage src={member.image} alt="" />}
                <AvatarFallback>{initials(member.name)}</AvatarFallback>
              </Avatar>
            }
            title={
              <>
                {member.name}
                {member.status === "pending" && <Badge variant="secondary">Pending</Badge>}
              </>
            }
            description={`${member.email} · ${ROLE_LABELS[member.role] ?? member.role}`}
          >
            {member.status === "pending" && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Copy invite link for ${member.email}`}
                onClick={() => copyLink(member)}
              >
                <Copy />
              </Button>
            )}
            {member.role !== "owner" && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${member.name}`}
                onClick={() => remove(member)}
              >
                <Trash />
              </Button>
            )}
          </SettingsRow>
        </div>
      ))}
    </SettingsList>
  );
}
