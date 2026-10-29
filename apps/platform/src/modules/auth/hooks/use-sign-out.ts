import { useNavigate } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { resetPlatformConfig } from "@/modules/platform/hooks/use-platform-config";
import { resetProjects } from "@/modules/projects/hooks/use-projects";
import { resetRuntimes } from "@/modules/runtimes/hooks/use-runtimes";
import { resetProviders } from "@/modules/settings/hooks/use-providers";
import { resetModelSelection } from "@/modules/threads/hooks/use-model-selection";
import { resetThreads } from "@/modules/threads/hooks/use-threads";

// Signs out and forgets everything cached for that user, so the next one never sees it.
export function useSignOut() {
  const navigate = useNavigate();

  return async () => {
    await authClient.signOut();
    resetProjects();
    resetThreads();
    resetRuntimes();
    resetProviders();
    resetModelSelection();
    resetPlatformConfig();
    await navigate({ to: "/login" });
  };
}
