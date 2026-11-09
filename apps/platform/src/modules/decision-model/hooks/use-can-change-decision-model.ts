import { authClient } from "@/lib/auth-client";
import { isOwnerOrAdminRole } from "@/lib/member-role";

export function useCanChangeDecisionModel() {
  const { data: member } = authClient.useActiveMember();
  return isOwnerOrAdminRole(member?.role);
}
