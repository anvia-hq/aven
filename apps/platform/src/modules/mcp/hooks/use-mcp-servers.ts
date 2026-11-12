import { getDefaultStore, useAtom } from "jotai";
import { useEffect } from "react";

import { toast } from "@/components/toast";
import { api, attempt, postJson } from "@/lib/api";
import { createListStore } from "@/lib/list-store";

import { mcpServersAtom } from "../atoms/mcp-atom";
import type { McpServer, McpServerInput } from "../types";

const mcpStore = createListStore<McpServer>({
  path: "/mcp-servers",
  atom: mcpServersAtom,
  label: "MCP servers",
});

export function resetMcpServers() {
  mcpStore.reset();
}

export function refreshMcpServers() {
  if (getDefaultStore().get(mcpServersAtom) !== null) void mcpStore.refresh();
}

export function useMcpServers() {
  const [servers] = useAtom(mcpServersAtom);
  const { refresh } = mcpStore;

  useEffect(() => {
    if (servers === null) void refresh();
  }, [servers, refresh]);

  async function change(failureTitle: string, request: () => Promise<unknown>) {
    const changed = await attempt(failureTitle, async () => {
      await request();
      return true;
    });

    if (!changed) return false;

    await refresh();
    return true;
  }

  async function create(input: McpServerInput) {
    const created = await change("Could not add MCP server", () =>
      postJson<McpServer>("/mcp-servers", input),
    );

    if (created) toast.add({ title: "MCP server added", description: input.name, type: "success" });

    return created;
  }

  async function update(server: McpServer, input: McpServerInput) {
    const saved = await change("Could not save MCP server", () =>
      postJson<McpServer>(`/mcp-servers/${server.id}`, input, "PATCH"),
    );

    if (saved) toast.add({ title: "MCP server saved", description: input.name, type: "success" });

    return saved;
  }

  function setEnabled(server: McpServer, enabled: boolean) {
    return change("Could not update MCP server", () =>
      postJson<McpServer>(`/mcp-servers/${server.id}`, { enabled }, "PATCH"),
    );
  }

  async function remove(server: McpServer) {
    const removed = await change("Could not remove MCP server", () =>
      api<{ ok: true }>(`/mcp-servers/${server.id}`, { method: "DELETE" }),
    );

    if (removed) toast.add({ title: "MCP server removed", description: server.name });
  }

  return {
    servers: servers ?? [],
    loaded: servers !== null,
    create,
    update,
    setEnabled,
    remove,
  };
}
