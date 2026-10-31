import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { VariablesSection } from "@/modules/variables/components/variables-section";

export const Route = createFileRoute("/_authed/settings/environment-variables")({
  component: EnvironmentVariables,
});

function EnvironmentVariables() {
  return (
    <SettingsPage
      title="Environment variables"
      description="Yours alone, in this workspace: the agent's commands get them in every thread you send a message to, and they replace a project's or the workspace's of the same name."
    >
      <VariablesSection
        scope={{ kind: "personal" }}
        title="Your variables"
        empty="None yet. Add a key of your own, such as a personal access token."
      />
    </SettingsPage>
  );
}
