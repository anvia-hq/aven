import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { AddProviderDialog } from "@/modules/settings/components/add-provider-dialog";
import { ProvidersList } from "@/modules/settings/components/providers-list";

export const Route = createFileRoute("/_authed/settings/providers")({
  component: Providers,
});

function Providers() {
  return (
    <>
      <PageHeader
        title="Providers"
        description="The models your threads run on. They belong to you, not to a workspace; the default one is used when you send a message."
        actions={<AddProviderDialog />}
      />
      <ProvidersList />
    </>
  );
}
