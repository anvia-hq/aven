import { authClient } from "@/lib/auth-client";
import { isOwnerOrAdminRole } from "@/lib/member-role";

import type { VariableScope } from "../types";

// Whether the person may change a scope's variables (decision 0046): their own and a project's
// always; the workspace's only as an owner or an admin.
export function useCanChangeVariables(scope: VariableScope) {
  const { data: member } = authClient.useActiveMember();
  if (scope.kind !== "workspace") return true;
  return isOwnerOrAdminRole(member?.role);
}
