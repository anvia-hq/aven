import { useNavigate } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { resetOrganizationData } from "@/modules/organizations/hooks/use-organizations";
import { resetPlatformConfig } from "@/modules/platform/hooks/use-platform-config";
import { resetProviders } from "@/modules/settings/hooks/use-providers";
import { resetSkills } from "@/modules/settings/hooks/use-skills";
import { resetModelSelection } from "@/modules/threads/hooks/use-model-selection";

// Signs out and forgets everything cached for that user, so the next one never sees it.
export function useSignOut() {
  const navigate = useNavigate();

  return async () => {
    await authClient.signOut();
    resetOrganizationData();
    resetProviders();
    resetSkills();
    resetModelSelection();
    resetPlatformConfig();
    await navigate({ to: "/login" });
  };
}
