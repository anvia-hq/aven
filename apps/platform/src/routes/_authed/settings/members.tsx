import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { InviteMemberDialog } from "@/modules/settings/components/invite-member-dialog";
import { MembersTable } from "@/modules/settings/components/members-table";

export const Route = createFileRoute("/_authed/settings/members")({
  component: Members,
});

function Members() {
  return (
    <>
      <PageHeader
        title="Members"
        description="People with access to this workspace."
        actions={<InviteMemberDialog />}
      />
      <MembersTable />
    </>
  );
}
