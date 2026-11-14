import { Pencil, Trash } from "@mynaui/icons-react";
import { useState } from "react";

import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import { Switch } from "@aven/ui/switch";
import { timeAgo } from "@/lib/format";

import { useMcpServers } from "../hooks/use-mcp-servers";
import type { McpServer } from "../types";
import { EditMcpServerDialog, TARGET_LABELS } from "./mcp-server-dialog";

function McpServerRow({ server }: { server: McpServer }) {
  const { setEnabled, remove } = useMcpServers();
  const [editing, setEditing] = useState(false);

  return (
    <li className="flex items-start gap-3 border-b py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{server.name}</span>
          <Badge variant="secondary">{TARGET_LABELS[server.target]}</Badge>
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground">{server.url}</p>
        <p className="text-xs text-muted-foreground">
          {server.headerNames.length === 0
            ? "No headers"
            : `Headers: ${server.headerNames.join(", ")}`}
          {server.lastUsedAt && ` · Connected ${timeAgo(server.lastUsedAt, true)}`}
        </p>
        {server.lastError && (
          <p role="alert" className="text-xs text-destructive">
            Could not connect: {server.lastError}
          </p>
        )}
      </div>
      <Switch
        size="sm"
        aria-label={`Use ${server.name}`}
        checked={server.enabled}
        onCheckedChange={(enabled) => void setEnabled(server, enabled)}
      />
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Edit ${server.name}`}
        onClick={() => setEditing(true)}
      >
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${server.name}`}
        onClick={() => void remove(server)}
      >
        <Trash />
      </Button>
      <EditMcpServerDialog server={server} open={editing} onOpenChange={setEditing} />
    </li>
  );
}

export function McpServersList() {
  const { servers, loaded } = useMcpServers();

  if (!loaded) return null;

  if (servers.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        No MCP servers yet. Add one, or ask one of your bots to.
      </p>
    );
  }

  return (
    <ul aria-label="MCP servers" className="flex flex-col">
      {servers.map((server) => (
        <McpServerRow key={server.id} server={server} />
      ))}
    </ul>
  );
}
