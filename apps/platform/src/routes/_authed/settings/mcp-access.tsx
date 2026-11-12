import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { AccessTokenDialog } from "@/modules/mcp-access/components/access-token-dialog";
import { AccessTokensList } from "@/modules/mcp-access/components/access-tokens-list";

export const Route = createFileRoute("/_authed/settings/mcp-access")({
  component: McpAccess,
});

function McpAccess() {
  return (
    <SettingsPage
      title="MCP access"
      description="Let other tools and agents use Aven as you, through MCP. Each token has the permissions you choose, and you can remove it at any time."
      actions={<AccessTokenDialog />}
    >
      <AccessTokensList />
    </SettingsPage>
  );
}
