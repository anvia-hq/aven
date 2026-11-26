import { describe, expect, test } from "bun:test";

import { API_SEARCH_TOOL_NAME, API_TOOL_NAME, createApiTools } from "./api";

const tools = (host: Parameters<typeof createApiTools>[0]) => createApiTools(host);
const by = (list: ReturnType<typeof tools>, name: string) =>
  list.find((tool) => tool.name === name)!;

describe("aven api tools", () => {
  test("are a search and a call, and each passes its input to the host and formats plain text", async () => {
    const seen: unknown[] = [];
    const list = tools(async (params) => {
      seen.push(params);

      if (params.op === "search") {
        return {
          organizations: [{ id: "org1", name: "One" }],
          routes: [{ method: "GET", path: "/threads", tier: "read" }],
        };
      }

      return { status: 200, body: { ok: true } };
    });
    expect(list.map((tool) => tool.name)).toEqual([API_SEARCH_TOOL_NAME, API_TOOL_NAME]);

    const searched = await by(list, API_SEARCH_TOOL_NAME).call(
      { query: "threads" } as never,
      undefined as never,
    );
    const called = await by(list, API_TOOL_NAME).call(
      { method: "GET", path: "/threads" } as never,
      undefined as never,
    );
    expect(searched).toContain("- org1 (One)");
    expect(searched).toContain("- GET /threads [read]");
    expect(called).toContain("HTTP 200");
    expect(called).toContain('"ok": true');
    expect(seen).toEqual([
      { op: "search", query: "threads" },
      { op: "call", method: "GET", path: "/threads" },
    ]);
  });

  test("refuse a method that is not one of the five, and an empty path", async () => {
    const list = tools(async () => null);
    await expect(
      by(list, API_TOOL_NAME).call({ method: "TRACE", path: "/x" } as never, undefined as never),
    ).rejects.toThrow();
    await expect(
      by(list, API_TOOL_NAME).call({ method: "GET", path: "" } as never, undefined as never),
    ).rejects.toThrow();
  });
});
