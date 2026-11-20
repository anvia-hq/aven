import { describe, expect, test } from "bun:test";

import { MCP_MAX_HEADER_VALUE, MCP_MAX_NAME, MCP_MAX_URL } from "./mcp";
import { mcpHeaderName, mcpHeaderValue, mcpName, mcpUrl } from "./mcp-schema";

describe("mcpName", () => {
  test("accepts trimmed alphanumeric names with spaces, dashes and underscores", () => {
    expect(mcpName.parse("  Linear_API-2 ")).toBe("Linear_API-2");
    expect(mcpName.parse("a")).toBe("a");
  });

  test("rejects empty names, punctuation, and names over the limit", () => {
    for (const bad of ["", "   ", "bad/name", "bad:name", "a".repeat(MCP_MAX_NAME + 1)]) {
      expect(mcpName.safeParse(bad).success).toBe(false);
    }
  });
});

describe("mcpUrl", () => {
  test("accepts http and https URLs without embedded credentials", () => {
    expect(mcpUrl.parse(" https://mcp.example.com/sse ")).toBe("https://mcp.example.com/sse");
    expect(mcpUrl.parse("http://localhost:8080/mcp")).toBe("http://localhost:8080/mcp");
  });

  test("rejects non-http protocols, embedded credentials, invalid URLs, and oversize URLs", () => {
    for (const bad of [
      "ftp://example.com/mcp",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "https://user:pass@example.com/mcp",
      "https://user@example.com/mcp",
      "https://:pass@example.com/mcp",
      "not-a-url",
      "",
      `https://example.com/${"a".repeat(MCP_MAX_URL)}`,
    ]) {
      expect(mcpUrl.safeParse(bad).success).toBe(false);
    }
  });
});

describe("mcpHeaderName", () => {
  test("accepts valid non-reserved header names", () => {
    expect(mcpHeaderName.parse(" Authorization ")).toBe("Authorization");
    expect(mcpHeaderName.parse("X-Api-Key")).toBe("X-Api-Key");
  });

  test("rejects reserved connection headers regardless of case and invalid token chars", () => {
    for (const bad of [
      "Host",
      "host",
      "Content-Length",
      "Content-Type",
      "Accept",
      "Transfer-Encoding",
      "Connection",
      "Mcp-Session-Id",
      "MCP-Protocol-Version",
      "X Bad Header",
      "X-Header:value",
      "",
      "a".repeat(101),
    ]) {
      expect(mcpHeaderName.safeParse(bad).success).toBe(false);
    }
  });
});

describe("mcpHeaderValue", () => {
  test("accepts single-line header values", () => {
    expect(mcpHeaderValue.parse("Bearer token-123")).toBe("Bearer token-123");
  });

  test("rejects CR, LF, NUL injection, empty strings, and oversize values", () => {
    for (const bad of [
      "",
      "ok\r\nX-Injected: 1",
      "ok\nX-Injected: 1",
      "ok\rX-Injected: 1",
      "ok\0null",
      "a".repeat(MCP_MAX_HEADER_VALUE + 1),
    ]) {
      expect(mcpHeaderValue.safeParse(bad).success).toBe(false);
    }
  });
});
