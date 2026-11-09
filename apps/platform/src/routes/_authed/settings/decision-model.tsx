import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { DecisionModelSection } from "@/modules/decision-model/components/decision-model-section";

export const Route = createFileRoute("/_authed/settings/decision-model")({
  component: DecisionModel,
});

function DecisionModel() {
  return (
    <SettingsPage
      title="Decision model"
      description="One for the workspace. Only an owner or an admin can change it."
    >
      <DecisionModelSection />
    </SettingsPage>
  );
}
