import { authClient } from "@/lib/auth-client";
import { isOwnerOrAdminRole } from "@/lib/member-role";

import type { VariableScope } from "../types";

export function useCanChangeVariables(scope: VariableScope) {
  const { data: member } = authClient.useActiveMember();
  if (scope.kind !== "workspace") return true;
  return isOwnerOrAdminRole(member?.role);
}
