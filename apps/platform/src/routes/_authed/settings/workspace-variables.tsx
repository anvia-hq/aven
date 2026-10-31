import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { VariablesSection } from "@/modules/variables/components/variables-section";

export const Route = createFileRoute("/_authed/settings/workspace-variables")({
  component: WorkspaceVariables,
});

function WorkspaceVariables() {
  return (
    <SettingsPage
      title="Variables"
      description="For every project in the workspace: the agent's commands get them in every member's threads, unless a project or a person sets the same name. Only an owner or an admin can change them."
    >
      <VariablesSection
        scope={{ kind: "workspace" }}
        title="Workspace variables"
        empty="None yet. Add what every project shares, such as a registry token or a region."
      />
    </SettingsPage>
  );
}
