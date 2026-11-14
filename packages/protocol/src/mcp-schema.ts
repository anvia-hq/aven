import { z } from "zod";

import {
  MCP_HEADER_NAME,
  MCP_MAX_HEADER_VALUE,
  MCP_MAX_NAME,
  MCP_MAX_URL,
  MCP_NAME,
  MCP_RESERVED_HEADERS,
} from "./mcp";

export const mcpName = z
  .string()
  .trim()
  .min(1)
  .max(MCP_MAX_NAME)
  .regex(MCP_NAME, "Use letters, digits, spaces, dashes and underscores");

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

export const mcpHeaderValue = z
  .string()
  .min(1)
  .max(MCP_MAX_HEADER_VALUE)
  .refine((value) => !/[\r\n\0]/.test(value), "A header's value is one line");
