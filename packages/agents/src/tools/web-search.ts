import { createTool } from "@anvia/core";
import { z } from "zod";

export const WEB_SEARCH_TOOL_NAME = "web_search";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

export const webSearchInput = z.object({
  query: z.string().min(1).describe("What to search the web for."),
  topic: z
    .enum(["general", "news"])
    .optional()
    .describe("Use 'news' for recent events; defaults to 'general'."),
  maxResults: z.int().min(1).max(10).optional().describe("Results to return (default 5)."),
  timeRange: z
    .enum(["day", "week", "month", "year"])
    .optional()
    .describe("Only return results published within this window."),
});

const MAX_SNIPPET_CHARS = 1_500;

type TavilyResponse = {
  answer?: string | null;
  results?: { title?: string; url?: string; content?: string }[];
};

type WebSearchOptions = {
  apiKey: string;
  fetch?: typeof fetch;
};

export function createWebSearchTool(options: WebSearchOptions) {
  const request = options.fetch ?? fetch;

  return createTool({
    name: WEB_SEARCH_TOOL_NAME,
    description:
      "Search the web for current information. Returns a short synthesized answer and the top results (title, url, content). Cite urls when you use them.",
    inputSchema: webSearchInput,
    async handler(args, context): Promise<string> {
      const response = await request(TAVILY_SEARCH_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          query: args.query,
          topic: args.topic ?? "general",
          max_results: args.maxResults ?? 5,
          time_range: args.timeRange,
          include_answer: true,
        }),
        signal: context?.abortSignal,
      });

      if (!response.ok) throw new Error(`Tavily search failed with ${response.status}`);

      const body = (await response.json()) as TavilyResponse;
      const sections: string[] = [];

      if (body.answer?.trim()) sections.push(`Answer: ${body.answer.trim()}`);

      const results = body.results ?? [];

      if (results.length === 0 && sections.length === 0) return "No results found.";

      for (const [index, result] of results.entries()) {
        const title = result.title?.trim() || "(untitled)";
        const url = result.url?.trim() || "";
        const raw = result.content?.trim() ?? "";
        const content =
          raw.length > MAX_SNIPPET_CHARS ? `${raw.slice(0, MAX_SNIPPET_CHARS)}…` : raw;
        const lines = [`[${index + 1}] ${title}`];

        if (url) lines.push(url);

        if (content) lines.push(content);

        sections.push(lines.join("\n"));
      }

      return sections.join("\n\n");
    },
  });
}
