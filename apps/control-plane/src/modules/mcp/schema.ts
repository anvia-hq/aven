import { MCP_MAX_HEADERS, MCP_TARGETS } from "@aven/protocol/mcp";
import { mcpHeaderName, mcpHeaderValue, mcpName, mcpUrl } from "@aven/protocol/mcp-schema";
import { z } from "zod";

export const mcpParams = z.object({ id: z.uuid() });

const distinct = (headers: { name: string }[]) =>
  new Set(headers.map((header) => header.name.toLowerCase())).size === headers.length;

export const createMcpBody = z.object({
  name: mcpName,
  url: mcpUrl,
  headers: z
    .array(z.object({ name: mcpHeaderName, value: mcpHeaderValue }))
    .max(MCP_MAX_HEADERS)
    .refine(distinct, "A header is given once")
    .default([]),
  target: z.enum(MCP_TARGETS).default("all"),
  enabled: z.boolean().default(true),
  allowLocal: z.boolean().default(false),
});

export const updateMcpBody = z
  .object({
    name: mcpName,
    url: mcpUrl,
    headers: z
      .array(z.object({ name: mcpHeaderName, value: mcpHeaderValue.nullable() }))
      .max(MCP_MAX_HEADERS)
      .refine(distinct, "A header is given once"),
    target: z.enum(MCP_TARGETS),
    enabled: z.boolean(),
    allowLocal: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: "Nothing to update" });

export type CreateMcpBody = z.infer<typeof createMcpBody>;
export type UpdateMcpBody = z.infer<typeof updateMcpBody>;
