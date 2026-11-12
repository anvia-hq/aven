import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { CodexLoginSection } from "@/modules/codex-setup/components/codex-login-section";

export const Route = createFileRoute("/_authed/settings/codex")({
  component: CodexSettings,
});

function CodexSettings() {
  return (
    <SettingsPage
      title="Codex"
      description="Run threads on Codex with your own ChatGPT login, instead of Aven's own agent. Choose a Codex model from the model menu when you start a thread. The login is not shared with anyone else."
    >
      <CodexLoginSection />
    </SettingsPage>
  );
}
