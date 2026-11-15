import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { CodexSetupSection } from "@/modules/codex-setup/components/codex-setup-section";

export const Route = createFileRoute("/_authed/settings/codex")({
  component: CodexSettings,
});

function CodexSettings() {
  return (
    <SettingsPage
      title="Codex"
      description="Run threads on OpenAI's Codex SDK with your own API key, instead of Aven's own agent. Choose a Codex model from the model menu when you start a thread."
    >
      <CodexSetupSection />
    </SettingsPage>
  );
}
