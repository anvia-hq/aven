import {
  MCP_HEADER_NAME,
  MCP_MAX_HEADER_VALUE,
  MCP_MAX_HEADERS,
  MCP_MAX_NAME,
  MCP_MAX_URL,
  MCP_NAME,
  MCP_RESERVED_HEADERS,
  MCP_TARGETS,
} from "@aven/protocol/mcp";
import { z } from "zod";

export const mcpParams = z.object({ id: z.uuid() });

export const mcpName = z
  .string()
  .trim()
  .min(1)
  .max(MCP_MAX_NAME)
  .regex(MCP_NAME, "Use letters, digits, spaces, dashes and underscores");

// A server is reached over the network by the runner: http or https, and no credentials in the
// address, which would be shown and logged where a header's value never is.
export const mcpUrl = z
  .string()
  .trim()
  .max(MCP_MAX_URL)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return (
        (parsed.protocol === "https:" || parsed.protocol === "http:") &&
        !parsed.username &&
        !parsed.password
      );
    } catch {
      return false;
    }
  }, "Use an http or https address with no user name or password in it");

export const mcpHeaderName = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(MCP_HEADER_NAME, "Not a header name")
  .refine(
    (value) => !MCP_RESERVED_HEADERS.has(value.toLowerCase()),
    "The connection sets that header",
  );

// A line break in a value would end the header and start another.
export const mcpHeaderValue = z
  .string()
  .min(1)
  .max(MCP_MAX_HEADER_VALUE)
  .refine((value) => !/[\r\n\0]/.test(value), "A header's value is one line");

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

// Headers replace the server's set: a header listed without a value keeps the value it has, and
// one not listed is removed. Values are never read back, so this is how one is left alone.
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
