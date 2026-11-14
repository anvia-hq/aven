import { isOwnerOrAdminRole } from "@aven/protocol/roles";
import { authClient } from "@/lib/auth-client";

export function useCanChangeDecisionModel() {
  const { data: member } = authClient.useActiveMember();
  return isOwnerOrAdminRole(member?.role);
}
