import { Copy, Trash } from "@mynaui/icons-react";

import { Avatar, AvatarFallback } from "@/components/avatar";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/table";
import { initials } from "@/lib/format";

import { useMembers } from "../hooks/use-members";
import { ROLE_LABELS } from "../types";

export function MembersTable() {
  const { members, copyLink, remove } = useMembers();

  return (
    <Table aria-label="Members">
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-24" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member.id}>
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar size="sm">
                  <AvatarFallback>{initials(member.name)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="font-medium">{member.name}</span>
                  <span className="text-xs text-muted-foreground">{member.email}</span>
                </div>
              </div>
            </TableCell>
            <TableCell>{ROLE_LABELS[member.role] ?? member.role}</TableCell>
            <TableCell>
              <Badge variant={member.status === "pending" ? "secondary" : "outline"}>
                {member.status === "pending" ? "Pending" : "Active"}
              </Badge>
            </TableCell>
            <TableCell className="flex justify-end">
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
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
