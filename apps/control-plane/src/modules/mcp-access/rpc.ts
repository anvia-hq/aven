import { classify, normalizePath, BotApiRefusal } from "../bot-api/gate";
import { GUIDE, GUIDE_URI, INSTRUCTIONS, PERMISSIONS_URI } from "./guide";
import type {
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcResponse,
  McpCaller,
  McpServerOptions,
} from "./types";
import type { AccessPermission, BotApiMethod, BotApiParams } from "@aven/protocol/types";

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const METHODS: BotApiMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const PERMISSION_OF_TIER: Record<string, AccessPermission> = {
  read: "read",
  change: "change",
  confirm: "destructive",
};

const ORGANIZATION = {
  type: "string",
  description: "The workspace to act in. Leave out when there is only one.",
};

const NEEDS: Record<string, AccessPermission> = {
  aven_list_projects: "read",
  aven_get_thread: "read",
  aven_start_task: "change",
  aven_stop_thread: "change",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TOOLS = [
  {
    name: "aven_workspaces",
    description: "List the Aven workspaces (organizations) the token's owner is in.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "aven_list_projects",
    description:
      "List the projects (folders on runners) in a workspace, with their ids. Start here to give an agent a task.",
    inputSchema: {
      type: "object",
      properties: { organizationId: ORGANIZATION },
      additionalProperties: false,
    },
  },
  {
    name: "aven_start_task",
    description:
      "Start an agent on a project: creates a thread and sends it the task. Returns the thread's id; the agent keeps working, so follow it with aven_get_thread until running is false.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "A project's id from aven_list_projects" },
        prompt: { type: "string", description: "The task, as you would tell a colleague" },
        title: { type: "string", description: "A title for the thread" },
        backend: {
          type: "string",
          enum: ["native", "claude"],
          description:
            "native uses a model key from Providers; claude uses the person's Claude subscription",
        },
        organizationId: ORGANIZATION,
      },
      required: ["projectId", "prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "aven_get_thread",
    description:
      "Read a thread: whether the agent is still running and the conversation so far. Poll every few seconds while running is true.",
    inputSchema: {
      type: "object",
      properties: { threadId: { type: "string" }, organizationId: ORGANIZATION },
      required: ["threadId"],
      additionalProperties: false,
    },
  },
  {
    name: "aven_stop_thread",
    description: "Stop the agent working in a thread.",
    inputSchema: {
      type: "object",
      properties: { threadId: { type: "string" }, organizationId: ORGANIZATION },
      required: ["threadId"],
      additionalProperties: false,
    },
  },
  {
    name: "aven_search_api",
    description:
      "Find Aven API routes you may call with this token. Every word of the query must appear in the route. Each route has its tier and, when it takes a body, the body's JSON schema.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to look for, like 'threads messages'" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "aven_call_api",
    description:
      "Call an Aven API route as the token's owner. Returns { status, body }. Read aven://guide for the common workflows.",
    inputSchema: {
      type: "object",
      properties: {
        method: { type: "string", enum: METHODS },
        path: { type: "string", description: "A path like /threads or /threads/<id>/messages" },
        body: { description: "The JSON body of the route, if it takes one" },
        organizationId: {
          type: "string",
          description: "The workspace to act in. Leave out when there is only one.",
        },
      },
      required: ["method", "path"],
      additionalProperties: false,
    },
  },
];

const RESOURCES = [
  {
    uri: GUIDE_URI,
    name: "How to use Aven",
    description: "What Aven is, the tools, the permissions, and how to give an agent a task.",
    mimeType: "text/markdown",
  },
  {
    uri: PERMISSIONS_URI,
    name: "What this token may do",
    description: "The permissions this access token holds.",
    mimeType: "application/json",
  },
];

const ok = (id: JsonRpcId, result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });

const failure = (id: JsonRpcId, code: number, message: string): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const text = (value: unknown, isError = false) => {
  const content = [
    { type: "text", text: typeof value === "string" ? value : JSON.stringify(value) },
  ];

  return isError ? { content, isError } : { content };
};

export function createMcpServer({ api, version }: McpServerOptions) {
  async function route(
    caller: McpCaller,
    method: BotApiMethod,
    rawPath: string,
    body: unknown,
    organizationId: unknown,
  ): Promise<{ refusal: string } | { status: number; body: unknown }> {
    const { path } = normalizePath(rawPath);
    const tier = classify(method, path);

    if (tier === "blocked") return { refusal: "This route is not available through a token" };

    const needed = PERMISSION_OF_TIER[tier]!;

    if (!caller.permissions.includes(needed)) {
      return { refusal: `This token does not have the ${needed} permission` };
    }

    const call: BotApiParams = {
      replyId: `mcp-${caller.tokenId}`,
      op: "call",
      method,
      path: rawPath,
      confirmed: true,
    };

    if (body !== undefined) call.body = body;

    if (typeof organizationId === "string") call.organizationId = organizationId;

    const answer = await api.answer({ userId: caller.userId, params: call, onPersonsWord: true });

    return "status" in answer ? answer : { refusal: "The call did not answer" };
  }

  async function callTool(caller: McpCaller, name: string, args: Record<string, unknown>) {
    const replyId = `mcp-${caller.tokenId}`;

    if (name === "aven_workspaces") {
      const answer = await api.answer({
        userId: caller.userId,
        params: { replyId, op: "search" },
        onPersonsWord: false,
      });
      return text("organizations" in answer ? answer.organizations : []);
    }

    if (name === "aven_search_api") {
      const search: BotApiParams = { replyId, op: "search" };

      if (typeof args.query === "string") search.query = args.query;

      const answer = await api.answer({
        userId: caller.userId,
        params: search,
        onPersonsWord: false,
      });

      if (!("routes" in answer)) return text("The routes could not be listed", true);

      return text({
        routes: answer.routes.filter((route) =>
          caller.permissions.includes(PERMISSION_OF_TIER[route.tier] ?? "destructive"),
        ),
        organizations: answer.organizations,
      });
    }

    if (name === "aven_call_api") {
      const method = METHODS.find((item) => item === args.method);

      if (!method || typeof args.path !== "string") {
        return text("Pass a method (GET, POST, PUT, PATCH or DELETE) and a path", true);
      }

      const done = await route(caller, method, args.path, args.body, args.organizationId);

      return "refusal" in done ? text(done.refusal, true) : text(done, done.status >= 400);
    }

    if (name === "aven_list_projects") {
      const done = await route(caller, "GET", "/projects", undefined, args.organizationId);

      return "refusal" in done ? text(done.refusal, true) : text(done, done.status >= 400);
    }

    if (name === "aven_get_thread" || name === "aven_stop_thread") {
      if (typeof args.threadId !== "string" || !UUID.test(args.threadId)) {
        return text("Pass threadId, the thread's id", true);
      }

      const done =
        name === "aven_get_thread"
          ? await route(caller, "GET", `/threads/${args.threadId}`, undefined, args.organizationId)
          : await route(
              caller,
              "POST",
              `/threads/${args.threadId}/cancel`,
              undefined,
              args.organizationId,
            );

      return "refusal" in done ? text(done.refusal, true) : text(done, done.status >= 400);
    }

    if (name === "aven_start_task") {
      if (typeof args.projectId !== "string" || !UUID.test(args.projectId)) {
        return text("Pass projectId, the project's id from aven_list_projects", true);
      }

      if (typeof args.prompt !== "string" || args.prompt.trim() === "") {
        return text("Pass prompt, the task for the agent", true);
      }

      const thread: Record<string, unknown> = { projectId: args.projectId };

      if (typeof args.title === "string") thread.title = args.title;

      if (typeof args.backend === "string") thread.backend = args.backend;

      const created = await route(caller, "POST", "/threads", thread, args.organizationId);

      if ("refusal" in created) return text(created.refusal, true);

      const threadId = record(created.body).id;

      if (created.status >= 400 || typeof threadId !== "string") return text(created, true);

      const sent = await route(
        caller,
        "POST",
        `/threads/${threadId}/messages`,
        { prompt: args.prompt },
        args.organizationId,
      );

      if ("refusal" in sent) return text({ threadId, started: false, reason: sent.refusal }, true);

      return text(
        { threadId, started: sent.status < 400, status: sent.status, body: sent.body },
        sent.status >= 400,
      );
    }

    return text(`There is no tool named ${name}`, true);
  }

  async function handle(caller: McpCaller, request: JsonRpcRequest) {
    const id = request.id ?? null;
    const params = record(request.params);

    if (request.method === "initialize") {
      const wanted = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return ok(id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(wanted) ? wanted : SUPPORTED_VERSIONS[0],
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "aven", title: "Aven", version },
        instructions: INSTRUCTIONS,
      });
    }

    if (request.method === "ping") return ok(id, {});

    if (request.method === "tools/list") {
      return ok(id, {
        tools: TOOLS.filter((tool) => {
          const needed = NEEDS[tool.name];
          return !needed || caller.permissions.includes(needed);
        }),
      });
    }

    if (request.method === "resources/list") return ok(id, { resources: RESOURCES });

    if (request.method === "resources/templates/list") return ok(id, { resourceTemplates: [] });

    if (request.method === "resources/read") {
      if (params.uri === GUIDE_URI) {
        return ok(id, {
          contents: [{ uri: GUIDE_URI, mimeType: "text/markdown", text: GUIDE }],
        });
      }

      if (params.uri === PERMISSIONS_URI) {
        return ok(id, {
          contents: [
            {
              uri: PERMISSIONS_URI,
              mimeType: "application/json",
              text: JSON.stringify({ permissions: caller.permissions }),
            },
          ],
        });
      }

      return failure(id, -32002, "Resource not found");
    }

    if (request.method === "tools/call") {
      if (typeof params.name !== "string") return failure(id, -32602, "A tool name is required");

      try {
        return ok(id, await callTool(caller, params.name, record(params.arguments)));
      } catch (error) {
        if (error instanceof BotApiRefusal) return ok(id, text(error.message, true));

        console.error("An MCP tool call failed:", error);
        return ok(id, text("The call failed", true));
      }
    }

    return failure(id, -32601, `Method not found: ${request.method}`);
  }

  return {
    async answer(caller: McpCaller, message: unknown): Promise<JsonRpcResponse | undefined> {
      const request = record(message);

      if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
        const hasId = "id" in request && typeof request.method !== "string";
        return hasId ? undefined : failure(null, -32600, "Not a JSON-RPC request");
      }

      if (!("id" in request)) {
        await handle(caller, request as JsonRpcRequest);
        return undefined;
      }

      return handle(caller, request as JsonRpcRequest);
    },
  };
}
