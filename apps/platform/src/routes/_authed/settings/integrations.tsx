import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { IntegrationList } from "@/modules/settings/components/integration-list";

export const Route = createFileRoute("/_authed/settings/integrations")({
  component: Integrations,
});

function Integrations() {
  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connect tools the agent can use inside threads."
      />
      <IntegrationList />
    </>
  );
}
