import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { CodexSetupSection } from "@/modules/codex-setup/components/codex-setup-section";
import { usePlatformConfig } from "@/modules/platform/hooks/use-platform-config";

export const Route = createFileRoute("/_authed/settings/codex")({
  component: CodexSettings,
});

function CodexSettings() {
  const { config } = usePlatformConfig();

  return (
    <SettingsPage
      title="Codex"
      description="Run threads on OpenAI's Codex SDK with your own API key, instead of Aven's own agent. Choose a Codex model from the model menu when you start a thread."
    >
      {config?.codexBackend === false ? (
        <p className="text-sm text-muted-foreground">
          The Codex agent is turned off on this server, so threads cannot run on it.
        </p>
      ) : (
        <CodexSetupSection />
      )}
    </SettingsPage>
  );
}
