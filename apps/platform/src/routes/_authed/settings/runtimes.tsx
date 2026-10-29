import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { NewRuntimeDialog } from "@/modules/runtimes/components/new-runtime-dialog";
import { RuntimesList } from "@/modules/runtimes/components/runtimes-list";

export const Route = createFileRoute("/_authed/settings/runtimes")({
  component: Runtimes,
});

function Runtimes() {
  return (
    <>
      <PageHeader
        title="Runtimes"
        description="Machines that run agents for this workspace. Projects live on one; without any, threads run on the control plane's own machine."
        actions={<NewRuntimeDialog />}
      />
      <RuntimesList />
    </>
  );
}
