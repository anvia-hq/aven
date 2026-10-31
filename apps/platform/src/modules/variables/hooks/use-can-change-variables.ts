import { authClient } from "@/lib/auth-client";

import type { VariableScope } from "../types";

// Whether the person may change a scope's variables (decision 0046): their own and a project's
// always; the workspace's only as an owner or an admin. A role can hold several, comma-separated.
export function useCanChangeVariables(scope: VariableScope) {
  const { data: member } = authClient.useActiveMember();
  if (scope.kind !== "workspace") return true;
  const roles = member?.role.split(",").map((role) => role.trim()) ?? [];
  return roles.some((role) => role === "owner" || role === "admin");
}
