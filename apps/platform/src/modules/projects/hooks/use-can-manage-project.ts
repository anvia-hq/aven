import { authClient } from "@/lib/auth-client";
import { isOwnerOrAdminRole } from "@/lib/member-role";

import type { Project } from "../types";

// Whether the person may change a project or delete it (decisions 0093 and 0094): whoever imported
// it, an owner or an admin. The control plane says the same, and refuses anyone else.
export function useCanManageProject(project: Project) {
  const { data: session } = authClient.useSession();
  const { data: member } = authClient.useActiveMember();
  return project.createdBy === session?.user.id || isOwnerOrAdminRole(member?.role);
}
