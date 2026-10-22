import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { ApiKeysTable } from "@/modules/settings/components/api-keys-table";
import { CreateApiKeyDialog } from "@/modules/settings/components/create-api-key-dialog";

export const Route = createFileRoute("/_authed/settings/api-keys")({
  component: ApiKeys,
});

function ApiKeys() {
  return (
    <>
      <PageHeader
        title="API keys"
        description="Authenticate the CLI and CI to your account."
        actions={<CreateApiKeyDialog />}
      />
      <ApiKeysTable />
    </>
  );
}
