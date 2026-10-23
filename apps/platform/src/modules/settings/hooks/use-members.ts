import { toast } from "@/components/toast";
import { authClient } from "@/lib/auth-client";

import type { InvitableRole, Member } from "../types";

export function useMembers() {
  const { data: organization, isPending } = authClient.useActiveOrganization();

  const members: Member[] = [
    ...(organization?.members ?? []).map((member) => ({
      id: member.id,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      status: "active" as const,
    })),
    ...(organization?.invitations ?? [])
      .filter((invitation) => invitation.status === "pending")
      .map((invitation) => ({
        id: invitation.id,
        name: invitation.email,
        email: invitation.email,
        role: invitation.role,
        status: "pending" as const,
      })),
  ];

  async function invite(email: string, role: InvitableRole) {
    const { error } = await authClient.organization.inviteMember({ email, role });
    if (error) {
      toast.add({ title: "Could not send invite", description: error.message, type: "error" });
      return false;
    }
    toast.add({ title: "Invitation sent", description: email, type: "success" });
    return true;
  }

  async function remove(member: Member) {
    if (member.status === "pending") {
      const { error } = await authClient.organization.cancelInvitation({ invitationId: member.id });
      if (error) {
        toast.add({ title: "Could not cancel invite", description: error.message, type: "error" });
        return;
      }
      toast.add({ title: "Invitation canceled", description: member.email });
      return;
    }

    const { error } = await authClient.organization.removeMember({ memberIdOrEmail: member.id });
    if (error) {
      toast.add({ title: "Could not remove member", description: error.message, type: "error" });
      return;
    }
    toast.add({ title: "Member removed", description: member.name });
  }

  return { members, isPending, invite, remove };
}
