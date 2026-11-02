import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { McpServerDialog } from "@/modules/mcp/components/mcp-server-dialog";
import { McpServersList } from "@/modules/mcp/components/mcp-servers-list";

export const Route = createFileRoute("/_authed/settings/mcp")({
  component: Mcp,
});

function Mcp() {
  return (
    <SettingsPage
      title="MCP servers"
      description="Remote tool servers your agents can use. They are yours, in every workspace, and only your own bots and threads use them. Your bots can also add and change them when you ask."
      actions={<McpServerDialog />}
    >
      <McpServersList />
    </SettingsPage>
  );
}
