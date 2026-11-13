import { toast } from "@aven/ui/toast";
import { authClient } from "@/lib/auth-client";
import { copyToClipboard } from "@/lib/clipboard";

import type { InvitableRole, Member } from "../types";

const inviteLink = (invitationId: string) =>
  `${window.location.origin}/accept-invitation/${invitationId}`;

const copyInviteLink = (invitationId: string) => copyToClipboard(inviteLink(invitationId));

export function useMembers() {
  const { data: organization, isPending } = authClient.useActiveOrganization();

  const members: Member[] = [
    ...(organization?.members ?? []).map((member) => ({
      id: member.id,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      image: member.user.image ?? null,
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
    const { data, error } = await authClient.organization.inviteMember({ email, role });

    if (error) {
      toast.add({ title: "Could not create invite", description: error.message, type: "error" });
      return false;
    }

    const copied = await copyInviteLink(data.id);
    toast.add({
      title: "Invitation created",
      description: copied
        ? `Invite link for ${email} copied`
        : `Copy the invite link for ${email} from the list`,
      type: "success",
    });
    return true;
  }

  async function copyLink(member: Member) {
    const copied = await copyInviteLink(member.id);
    toast.add(
      copied
        ? { title: "Invite link copied", description: member.email, type: "success" }
        : { title: "Could not copy the link", type: "error" },
    );
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

  return { members, isPending, invite, copyLink, remove };
}
