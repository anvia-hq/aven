import { toast } from "@/components/toast";
import { authClient } from "@/lib/auth-client";
import { resetProjects } from "@/modules/projects/hooks/use-projects";
import { resetRuntimes } from "@/modules/runtimes/hooks/use-runtimes";
import { resetThreads } from "@/modules/threads/hooks/use-threads";

export function useOrganizations() {
  const { data: organizations } = authClient.useListOrganizations();
  const { data: activeOrganization } = authClient.useActiveOrganization();

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
    // These lists are scoped to the active organization: drop them (and any request still in
    // flight for the previous one) so the new one refetches cleanly.
    resetProjects();
    resetThreads();
    resetRuntimes();
  }

  return { organizations: organizations ?? [], activeOrganization, switchTo };
}
