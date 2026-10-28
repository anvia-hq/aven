import { describe, expect, test } from "bun:test";

import { createWebSearchTool } from "./web-search";

function fakeFetch(respond: (request: Request) => Response) {
  const calls: Request[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    calls.push(request);
    return respond(request);
  }) as typeof fetch;
  return { impl, calls };
}

describe("web_search", () => {
  test("posts the query to Tavily with the key and maps the results", async () => {
    const { impl, calls } = fakeFetch(() =>
      Response.json({
        answer: "Bun is a JS runtime.",
        results: [
          { title: "Bun", url: "https://bun.sh", content: "Fast JS runtime", score: 0.9 },
          { url: "https://example.com" },
        ],
        response_time: 0.4,
      }),
    );
    const tool = createWebSearchTool({ apiKey: "tvly-test", fetch: impl });

    const output = await tool.call({ query: "what is bun", maxResults: 3, topic: "news" });

    expect(output).toEqual({
      answer: "Bun is a JS runtime.",
      results: [
        { title: "Bun", url: "https://bun.sh", content: "Fast JS runtime" },
        { title: "", url: "https://example.com", content: "" },
      ],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.tavily.com/search");
    expect(calls[0]!.headers.get("authorization")).toBe("Bearer tvly-test");
    expect(await calls[0]!.json()).toMatchObject({
      query: "what is bun",
      topic: "news",
      max_results: 3,
      include_answer: true,
    });
  });

  test("fails without leaking the key when Tavily rejects the request", async () => {
    const { impl } = fakeFetch(() => new Response("nope", { status: 401 }));
    const tool = createWebSearchTool({ apiKey: "tvly-secret", fetch: impl });

    const failure = await (async () => tool.call({ query: "x" }))().catch((error: Error) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("Tavily search failed with 401");
  });

  test("requires an API key", async () => {
    const previous = process.env.TAVILY_API_KEY;
    delete process.env.TAVILY_API_KEY;
    try {
      const { impl } = fakeFetch(() => Response.json({}));
      const tool = createWebSearchTool({ fetch: impl });
      await expect(tool.call({ query: "x" })).rejects.toThrow("TAVILY_API_KEY is not set");
    } finally {
      if (previous !== undefined) process.env.TAVILY_API_KEY = previous;
    }
  });
});
