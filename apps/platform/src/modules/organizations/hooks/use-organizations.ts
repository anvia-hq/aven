import { toast } from "@/components/toast";
import { authClient } from "@/lib/auth-client";
import { resetProjects } from "@/modules/projects/hooks/use-projects";
import { resetRuntimes } from "@/modules/runtimes/hooks/use-runtimes";
import { resetThreads } from "@/modules/threads/hooks/use-threads";

// These lists are scoped to the active organization: drop them (and any request still in flight
// for the previous one) so the next read refetches cleanly.
export function resetOrganizationData() {
  resetProjects();
  resetThreads();
  resetRuntimes();
}

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
    resetOrganizationData();
  }

  return { organizations: organizations ?? [], activeOrganization, switchTo };
}
