import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { ClaudeSetupSection } from "@/modules/claude-setup/components/claude-setup-section";
import { usePlatformConfig } from "@/modules/platform/hooks/use-platform-config";

export const Route = createFileRoute("/_authed/settings/claude")({
  component: ClaudeSettings,
});

function ClaudeSettings() {
  const { config } = usePlatformConfig();

  return (
    <SettingsPage
      title="Claude Subscription"
      description="Run threads on Anthropic's Claude Agent SDK with your own Claude subscription, instead of Aven's own agent. Choose a Claude model from the model menu when you start a thread."
    >
      {config?.claudeBackend === false ? (
        <p className="text-sm text-muted-foreground">
          The Claude agent is turned off on this server, so threads cannot run on it.
        </p>
      ) : (
        <ClaudeSetupSection />
      )}
    </SettingsPage>
  );
}
