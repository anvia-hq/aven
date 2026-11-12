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
      description="Run threads on Anthropic's Claude Agent SDK with your own Claude subscription, instead of Aven's own agent. Choose a Claude model from the model menu when you start a thread."
    >
      <ClaudeSetupSection />
    </SettingsPage>
  );
}
