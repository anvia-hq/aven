import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { WorkspaceGithubSection } from "@/modules/github/components/workspace-github-section";

export const Route = createFileRoute("/_authed/settings/github")({
  component: Github,
});

function Github() {
  return (
    <SettingsPage title="GitHub" description="How this workspace reaches GitHub.">
      <WorkspaceGithubSection />
    </SettingsPage>
  );
}
