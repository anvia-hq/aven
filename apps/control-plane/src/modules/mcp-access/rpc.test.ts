import { describe, expect, test } from "bun:test";

import { createMcpServer } from "./rpc";
import type { McpApi, McpCaller } from "./types";
import type { BotApiParams } from "@aven/protocol/types";

const calls: BotApiParams[] = [];

const api: McpApi = {
  async answer({ params }) {
    calls.push(params);

    if (params.op === "search") {
      return {
        routes: [
          { method: "GET", path: "/threads", tier: "read" },
          { method: "POST", path: "/threads", tier: "change" },
          { method: "DELETE", path: "/threads/:id", tier: "confirm" },
        ],
        organizations: [{ id: "org-1", name: "Team" }],
      };
    }

    return { status: params.path === "/missing" ? 404 : 200, body: { ok: true } };
  },
};

const server = createMcpServer({ api, version: "9.9.9" });

const caller = (...permissions: McpCaller["permissions"]): McpCaller => ({
  userId: "user-1",
  tokenId: "token-1",
  permissions,
});

const rpc = (who: McpCaller, method: string, params?: unknown) =>
  server.answer(who, { jsonrpc: "2.0", id: 1, method, params });

const text = (answer: unknown) => {
  const raw = (answer as { result: { content: { text: string }[] } }).result.content[0]!.text;

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
};

describe("the Aven MCP server", () => {
  test("introduces itself with its tools and resources, at the client's protocol version", async () => {
    const answer = await rpc(caller("read"), "initialize", { protocolVersion: "2025-06-18" });
    expect(answer).toMatchObject({
      result: {
        protocolVersion: "2025-06-18",
        serverInfo: { name: "aven", version: "9.9.9" },
        capabilities: { tools: {}, resources: {} },
      },
    });
    const tools = await rpc(caller("read"), "tools/list");
    expect(
      (tools as { result: { tools: { name: string }[] } }).result.tools.map((tool) => tool.name),
    ).toEqual(["aven_workspaces", "aven_search_api", "aven_call_api"]);
  });

  test("answers a notification with nothing", async () => {
    expect(
      await server.answer(caller("read"), { jsonrpc: "2.0", method: "notifications/initialized" }),
    ).toBeUndefined();
  });

  test("serves the guide and the token's permissions as resources", async () => {
    const listed = await rpc(caller("read"), "resources/list");
    expect(
      (listed as { result: { resources: { uri: string }[] } }).result.resources.map(
        (item) => item.uri,
      ),
    ).toEqual(["aven://guide", "aven://permissions"]);
    const guide = await rpc(caller("read"), "resources/read", { uri: "aven://guide" });
    expect(JSON.stringify(guide)).toContain("POST /threads/{id}/messages");
    const held = await rpc(caller("read", "change"), "resources/read", {
      uri: "aven://permissions",
    });
    expect(JSON.stringify(held)).toContain('permissions\\":[\\"read\\",\\"change\\"]');
    expect(await rpc(caller("read"), "resources/read", { uri: "aven://nope" })).toMatchObject({
      error: { code: -32002 },
    });
  });

  test("shows only the routes the token may call", async () => {
    const shown = await rpc(caller("read", "change"), "tools/call", {
      name: "aven_search_api",
      arguments: { query: "threads" },
    });
    expect((text(shown) as { routes: { method: string }[] }).routes.map((r) => r.method)).toEqual([
      "GET",
      "POST",
    ]);
  });

  test("calls a route the token has the permission for, as the token's owner", async () => {
    calls.length = 0;
    const answer = await rpc(caller("read", "change"), "tools/call", {
      name: "aven_call_api",
      arguments: {
        method: "POST",
        path: "/threads",
        body: { projectId: "p" },
        organizationId: "o",
      },
    });
    expect(text(answer)).toEqual({ status: 200, body: { ok: true } });
    expect(calls[0]).toMatchObject({
      op: "call",
      method: "POST",
      path: "/threads",
      body: { projectId: "p" },
      organizationId: "o",
      confirmed: true,
    });
  });

  test("refuses a call the token has no permission for, and never reaches the API", async () => {
    calls.length = 0;
    const change = await rpc(caller("read"), "tools/call", {
      name: "aven_call_api",
      arguments: { method: "POST", path: "/threads", body: {} },
    });
    expect(change).toMatchObject({ result: { isError: true } });
    expect(text(change)).toBe("This token does not have the change permission");
    const remove = await rpc(caller("read", "change"), "tools/call", {
      name: "aven_call_api",
      arguments: { method: "DELETE", path: "/threads/abc" },
    });
    expect(text(remove)).toBe("This token does not have the destructive permission");
    expect(calls).toEqual([]);
  });

  test("lets a destructive token delete without asking again", async () => {
    calls.length = 0;
    const answer = await rpc(caller("destructive"), "tools/call", {
      name: "aven_call_api",
      arguments: { method: "DELETE", path: "/threads/abc" },
    });
    expect(text(answer)).toEqual({ status: 200, body: { ok: true } });
    expect(calls[0]).toMatchObject({ method: "DELETE", confirmed: true });
  });

  test("never offers a blocked route, whatever the permissions", async () => {
    calls.length = 0;
    for (const path of ["/auth/sign-in", "/platform/settings", "/mcp-access", "/mcp"]) {
      const answer = await rpc(caller("read", "change", "destructive"), "tools/call", {
        name: "aven_call_api",
        arguments: { method: "GET", path },
      });
      expect(text(answer)).toBe("This route is not available through a token");
    }
    expect(calls).toEqual([]);
  });

  test("reports an error status as an error with the body", async () => {
    const answer = await rpc(caller("read"), "tools/call", {
      name: "aven_call_api",
      arguments: { method: "GET", path: "/missing" },
    });
    expect(answer).toMatchObject({ result: { isError: true } });
  });

  test("answers an unknown method with a JSON-RPC error", async () => {
    expect(await rpc(caller("read"), "nope")).toMatchObject({ error: { code: -32601 } });
  });
});
