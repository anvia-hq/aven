import { createTool } from "@anvia/core";
import { z } from "zod";

import { asRecord } from "../values";
import type { ApiHost } from "./types";

export const API_SEARCH_TOOL_NAME = "aven_api_search";
export const API_TOOL_NAME = "aven_api";

function formatSearch(raw: unknown) {
  const record = asRecord(raw);
  const organizations = Array.isArray(record.organizations) ? record.organizations : [];
  const routes = Array.isArray(record.routes) ? record.routes : [];
  const orgLines = organizations.map((item) => {
    const org = asRecord(item);
    return `- ${String(org.id ?? "")} (${String(org.name ?? "")})`;
  });
  const routeLines = routes.map((item) => {
    const route = asRecord(item);
    const body = route.body !== undefined ? ` body=${JSON.stringify(route.body)}` : "";
    return `- ${String(route.method ?? "")} ${String(route.path ?? "")} [${String(route.tier ?? "")}]${body}`;
  });
  return `Workspaces:\n${orgLines.join("\n") || "(none)"}\n\nRoutes (${routes.length}):\n${routeLines.join("\n") || "(none)"}`;
}

function formatCall(raw: unknown) {
  if (typeof raw === "string") return raw;

  const record = asRecord(raw);

  if (typeof record.status !== "number") return JSON.stringify(raw);

  const body = typeof record.body === "string" ? record.body : JSON.stringify(record.body, null, 2);
  return `HTTP ${record.status}\n${body ?? ""}`;
}

export function createApiTools(host: ApiHost) {
  const search = createTool({
    name: API_SEARCH_TOOL_NAME,
    description:
      "Look up what you can do in Aven itself, as the person: the routes of Aven's API, each with its method, path, how hard it is to undo (tier) and the shape of its body, and the workspaces the person belongs to. Search with a few words of the path, such as 'threads', 'runtimes' or 'projects'. Always look a route up here before you call it with aven_api.",
    inputSchema: z.object({
      query: z
        .string()
        .max(200)
        .optional()
        .describe("Words the route's method and path should contain, e.g. 'POST threads'."),
    }),
    handler: async ({ query }) => formatSearch(await host({ op: "search", query })),
  });

  const call = createTool({
    name: API_TOOL_NAME,
    description:
      "Call Aven's own API as the person, to do in Aven what they can do in the app. Find the route with aven_api_search first. A GET only reads. Anything else changes something and works only when the person's own message asks for it. A route marked 'confirm' is hard to undo: ask the person with ask_question first, and call again with confirmed: true only after they say yes. Secrets and sign-in are never available here. Returns the status and the JSON body, with secret fields hidden.",
    inputSchema: z.object({
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
      path: z
        .string()
        .min(1)
        .max(2000)
        .describe("The route's path with its ids filled in, e.g. /threads/<id>, and any query."),
      body: z.unknown().optional().describe("The JSON body, for POST, PUT and PATCH."),
      organizationId: z
        .string()
        .optional()
        .describe("The workspace to act in. Needed when the person belongs to more than one."),
      confirmed: z
        .boolean()
        .optional()
        .describe("Only after the person said yes to a route marked 'confirm'."),
    }),
    handler: async (input) => formatCall(await host({ op: "call", ...input })),
  });

  return [search, call];
}
