import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { NewRuntimeDialog } from "@/modules/runtimes/components/new-runtime-dialog";
import { RuntimesList } from "@/modules/runtimes/components/runtimes-list";

export const Route = createFileRoute("/_authed/settings/runtimes")({
  component: Runtimes,
});

function Runtimes() {
  return (
    <SettingsPage
      title="Runtimes"
      description="Computers and VMs that host sandboxes for this workspace. A project runs on one; the control plane is always available as a built-in runner."
      actions={<NewRuntimeDialog />}
    >
      <RuntimesList />
    </SettingsPage>
  );
}
