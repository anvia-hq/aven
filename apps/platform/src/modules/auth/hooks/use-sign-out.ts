import { useNavigate } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { clearUserState } from "@/lib/user-state";
import { resetBots } from "@/modules/bots/hooks/use-bots";
import { resetMentions } from "@/modules/mentions/hooks/use-mentions";
import { resetMcpServers } from "@/modules/mcp/hooks/use-mcp-servers";
import { resetAccessTokens } from "@/modules/mcp-access/hooks/use-access-tokens";
import { resetMemory } from "@/modules/memory/hooks/use-memory";
import { resetCockpitTags } from "@/modules/cockpit/hooks/use-collection";
import { resetInbox } from "@/modules/cockpit/hooks/use-inbox";
import { resetNotes } from "@/modules/cockpit/hooks/use-notes";
import { resetTasks } from "@/modules/cockpit/hooks/use-tasks";
import { resetOrganizationData } from "@/modules/organizations/hooks/use-organizations";
import { resetPlatformConfig } from "@/modules/platform/hooks/use-platform-config";
import { resetProviders } from "@/modules/providers/hooks/use-providers";
import { resetSkills } from "@/modules/skills/hooks/use-skills";

export function useSignOut() {
  const navigate = useNavigate();

  return async () => {
    await authClient.signOut();
    resetOrganizationData();
    resetBots();
    resetMentions();
    resetProviders();
    resetSkills();
    resetMcpServers();
    resetAccessTokens();
    resetMemory();
    resetInbox();
    resetTasks();
    resetNotes();
    resetCockpitTags();
    resetPlatformConfig();
    clearUserState();
    await navigate({ to: "/login" });
  };
}
