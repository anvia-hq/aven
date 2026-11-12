import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { ClaudeSetupSection } from "@/modules/claude-setup/components/claude-setup-section";

export const Route = createFileRoute("/_authed/settings/claude")({
  component: ClaudeSettings,
});

function ClaudeSettings() {
  return (
    <SettingsPage
      title="Claude"
      description="A setup token lets a new thread run on the Claude agent. It belongs to you, not to a workspace."
    >
      <ClaudeSetupSection />
    </SettingsPage>
  );
}
