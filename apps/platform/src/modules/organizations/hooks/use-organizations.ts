import { toast } from "@/components/toast";
import { authClient } from "@/lib/auth-client";

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
    }
  }

  return { organizations: organizations ?? [], activeOrganization, switchTo };
}
