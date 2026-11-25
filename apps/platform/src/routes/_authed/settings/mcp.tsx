import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { SettingsPage } from "@aven/ui/settings-section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@aven/ui/tabs";
import { McpServerDialog } from "@/modules/mcp/components/mcp-server-dialog";
import { McpServersList } from "@/modules/mcp/components/mcp-servers-list";
import { AccessTokenDialog } from "@/modules/mcp-access/components/access-token-dialog";
import { AccessTokensList } from "@/modules/mcp-access/components/access-tokens-list";

type McpTab = "servers" | "access";

export const Route = createFileRoute("/_authed/settings/mcp")({
  validateSearch: (search: Record<string, unknown>): { tab?: McpTab } => ({
    tab: search.tab === "access" ? "access" : undefined,
  }),
  component: Mcp,
});

function Mcp() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const active: McpTab = tab === "access" ? "access" : "servers";

  return (
    <SettingsPage
      title="MCP"
      description={
        active === "access"
          ? "Let other tools and agents use Aven as you, through MCP. Each token has the permissions you choose, and you can remove it at any time."
          : "Remote tool servers your agents can use. They are yours, in every workspace, and only your own bots and threads use them. Your bots can also add and change them when you ask."
      }
      actions={active === "access" ? <AccessTokenDialog /> : <McpServerDialog />}
    >
      <Tabs
        value={active}
        onValueChange={(next) => {
          void navigate({
            to: "/settings/mcp",
            search: next === "access" ? { tab: "access" } : {},
            replace: true,
          });
        }}
        className="flex-col gap-5"
      >
        <TabsList className="h-9">
          <TabsTrigger value="servers" className="px-3">
            Servers
          </TabsTrigger>
          <TabsTrigger value="access" className="px-3">
            Access tokens
          </TabsTrigger>
        </TabsList>
        <TabsContent value="servers">
          <McpServersList />
        </TabsContent>
        <TabsContent value="access">
          <AccessTokensList />
        </TabsContent>
      </Tabs>
    </SettingsPage>
  );
}
