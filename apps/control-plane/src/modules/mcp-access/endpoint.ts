import { Elysia } from "elysia";

import { createMcpServer } from "./rpc";
import { mcpAccessService } from "./service";
import type { McpApi } from "./types";

const UNAUTHORIZED = {
  status: 401,
  headers: { "www-authenticate": 'Bearer realm="aven"', "content-type": "application/json" },
};

const bearerOf = (request: Request) => {
  const header = request.headers.get("authorization") ?? "";
  return /^Bearer\s+(\S+)$/i.exec(header)?.[1];
};

export const mcpEndpoint = (api: McpApi, version: string) => {
  const server = createMcpServer({ api, version });

  return new Elysia({ prefix: "/mcp" })
    .post(
      "/",
      async ({ request }) => {
        const token = bearerOf(request);
        const caller = token ? await mcpAccessService.authenticate(token) : undefined;

        if (!caller) {
          return new Response(
            JSON.stringify({ error: "Send an Aven access token as a Bearer token" }),
            UNAUTHORIZED,
          );
        }

        let message: unknown;
        try {
          message = await request.json();
        } catch {
          return Response.json(
            { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
            { status: 400 },
          );
        }

        if (Array.isArray(message)) {
          const answers = (
            await Promise.all(message.map((item) => server.answer(caller, item)))
          ).filter((item) => item !== undefined);

          return answers.length > 0 ? Response.json(answers) : new Response(null, { status: 202 });
        }

        const answer = await server.answer(caller, message);

        return answer ? Response.json(answer) : new Response(null, { status: 202 });
      },
      { parse: "none" },
    )
    .get("/", () => new Response("Method not allowed", { status: 405, headers: { allow: "POST" } }))
    .delete(
      "/",
      () => new Response("Method not allowed", { status: 405, headers: { allow: "POST" } }),
    );
};
