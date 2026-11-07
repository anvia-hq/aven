import { authClient } from "@/lib/auth-client";
import { isOwnerOrAdminRole } from "@/lib/member-role";

import type { Project } from "../types";

export function useCanManageProject(project: Project) {
  const { data: session } = authClient.useSession();
  const { data: member } = authClient.useActiveMember();
  return project.createdBy === session?.user.id || isOwnerOrAdminRole(member?.role);
}
