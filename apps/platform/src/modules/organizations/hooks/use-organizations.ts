import { useSetAtom } from "jotai";

import { toast } from "@/components/toast";
import { authClient } from "@/lib/auth-client";
import { projectsAtom } from "@/modules/projects/atoms/projects-atom";
import { invalidateProjects } from "@/modules/projects/hooks/use-projects";
import { clearRuntimes } from "@/modules/runtimes/hooks/use-runtimes";
import { threadsAtom } from "@/modules/threads/atoms/threads-atom";
import { invalidateThreads } from "@/modules/threads/hooks/use-threads";

export function useOrganizations() {
  const { data: organizations } = authClient.useListOrganizations();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const setProjects = useSetAtom(projectsAtom);
  const setThreads = useSetAtom(threadsAtom);

  async function switchTo(organizationId: string) {
    const { error } = await authClient.organization.setActive({ organizationId });
    if (error) {
      toast.add({
        title: "Could not switch organization",
        description: error.message,
        type: "error",
      });
      return;
    }
    // Both lists are scoped to the active organization: drop them (and any request still in
    // flight for the previous one) so the new one refetches cleanly.
    invalidateProjects();
    setProjects(null);
    invalidateThreads();
    setThreads(null);
    clearRuntimes();
  }

  return { organizations: organizations ?? [], activeOrganization, switchTo };
}
