import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  CODEX_MCP_TOKEN_ENV,
  CODEX_SANDBOX,
  codexClientConfig,
  codexProcessEnv,
  createCodexQuery,
  imagePaths,
  promptOf,
} from "./sdk";
import type { CodexLoader, CodexQueryInput, CodexSdkEvent } from "./types";

const TOKEN = "sk-codex-process-env-0001";
const MCP_TOKEN = "mcp-token-for-the-run";

describe("the Codex process environment", () => {
  test("keeps the run's API key and drops a project or machine key", () => {
    const env = codexProcessEnv(
      [
        { name: "PATH", value: "/project/bin" },
        { name: "CODEX_API_KEY", value: "project-key-should-not-win" },
        { name: "OPENAI_API_KEY", value: "sk-project-key" },
      ],
      TOKEN,
      "/runner/codex/thread-1",
      MCP_TOKEN,
      {
        PATH: "/usr/bin",
        HOME: "/home/runner",
        OPENAI_API_KEY: "sk-machine-key",
        CODEX_API_KEY: "machine-codex-key",
      },
    );
    expect(env.CODEX_API_KEY).toBe(TOKEN);
    expect(env[CODEX_MCP_TOKEN_ENV]).toBe(MCP_TOKEN);
    expect(env.CODEX_HOME).toBe("/runner/codex/thread-1");
    expect(env.PATH).toBe("/project/bin");
    expect(env.HOME).toBe("/home/runner");
    expect(JSON.stringify(env)).not.toContain("sk-machine-key");
    expect(JSON.stringify(env)).not.toContain("sk-project-key");
    expect(JSON.stringify(env)).not.toContain("project-key-should-not-win");
    expect(JSON.stringify(env)).not.toContain("machine-codex-key");
  });

  test("keeps a project variable from redirecting Codex", () => {
    const env = codexProcessEnv(
      [
        { name: "OPENAI_BASE_URL", value: "https://attacker.example" },
        { name: "CODEX_HOME", value: "/tmp/elsewhere" },
        { name: "API_URL", value: "https://api.example" },
        { name: CODEX_MCP_TOKEN_ENV, value: "project-mcp-token" },
      ],
      TOKEN,
      "/runner/codex/thread-1",
      MCP_TOKEN,
      {},
    );
    expect(env.OPENAI_BASE_URL).toBeUndefined();
    expect(env.CODEX_HOME).toBe("/runner/codex/thread-1");
    expect(env.API_URL).toBe("https://api.example");
    expect(env[CODEX_MCP_TOKEN_ENV]).toBe(MCP_TOKEN);
  });
});

describe("a Codex turn", () => {
  test("prefixes Aven's instructions on the first turn only", () => {
    const first = promptOf({ prompt: "look", instructions: "Use the tools." });
    expect(first).toContain("You are running inside Aven");
    expect(first).toContain("Use the tools.");
    expect(first).toContain("look");
    expect(promptOf({ prompt: "again", instructions: "Use the tools.", sessionId: "sess" })).toBe(
      "again",
    );
  });

  test("writes pictures as files under the Codex home", async () => {
    const home = await mkdtemp(join(tmpdir(), "aven-codex-images-"));
    try {
      const paths = await imagePaths(home, [
        { mediaType: "image/png", data: Buffer.from("png").toString("base64") },
        { mediaType: "text/plain", data: Buffer.from("nope").toString("base64") },
      ]);
      expect(paths).toHaveLength(1);
      expect(paths[0]).toContain(join(home, "images"));
      expect(await readFile(paths[0]!, "utf8")).toBe("png");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("cleans up temporary image files when the turn finishes", async () => {
    const home = await mkdtemp(join(tmpdir(), "aven-codex-img-cleanup-"));
    const writtenPaths: string[] = [];
    const load: CodexLoader = async () => ({
      startThread() {
        return {
          async runStreamed(body) {
            if (Array.isArray(body)) {
              for (const part of body) {
                if (part && typeof part === "object" && "path" in part) {
                  writtenPaths.push(String(part.path));
                }
              }
            }

            expect(writtenPaths).toHaveLength(1);
            expect(existsSync(writtenPaths[0]!)).toBe(true);
            return {
              events: streamOf([{ type: "turn.completed", usage: emptyUsage() }]),
            };
          },
        };
      },
      resumeThread() {
        throw new Error("unused");
      },
    });
    try {
      const query = createCodexQuery(load);
      for await (const _event of query(
        input({
          codexHome: home,
          images: [{ mediaType: "image/png", data: Buffer.from("png").toString("base64") }],
        }),
      )) {
        void _event;
      }
      expect(writtenPaths).toHaveLength(1);
      expect(existsSync(writtenPaths[0]!)).toBe(false);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("asks the SDK for a read-only thread that calls Aven's tools", async () => {
    const home = await mkdtemp(join(tmpdir(), "aven-codex-query-"));
    const seen: Parameters<CodexLoader>[0][] = [];
    const threads: { model?: unknown; sandboxMode?: unknown; resumed?: string }[] = [];
    const load: CodexLoader = async (options) => {
      seen.push(options);
      return {
        startThread(thread) {
          threads.push(thread);
          return {
            async runStreamed() {
              return {
                events: streamOf([
                  { type: "thread.started", thread_id: "sess-1" },
                  { type: "turn.completed", usage: emptyUsage() },
                ]),
              };
            },
          };
        },
        resumeThread(id, thread) {
          threads.push({ ...thread, resumed: id });
          return {
            async runStreamed() {
              return { events: streamOf([]) };
            },
          };
        },
      };
    };
    const query = createCodexQuery(load);
    const first = query(input({ codexHome: home }));
    const events: CodexSdkEvent[] = [];
    for await (const event of first) events.push(event);
    const second = query(
      input({ codexHome: home, sessionId: "sess-1", model: "terra", effort: "high" }),
    );
    for await (const event of second) events.push(event);
    await rm(home, { recursive: true, force: true });

    expect(events.map((event) => event.type)).toEqual(["thread.started", "turn.completed"]);
    expect(seen[0]?.apiKey).toBe(TOKEN);
    expect(seen[0]?.config.features.shell_tool).toBe(false);
    expect(seen[0]?.config.mcp_servers.aven.url).toContain("127.0.0.1");
    expect(seen[0]?.config.mcp_servers.aven.default_tools_approval_mode).toBe("approve");
    expect(seen[0]?.config.mcp_servers.aven.bearer_token_env_var).toBe(CODEX_MCP_TOKEN_ENV);
    expect(seen[0]?.env[CODEX_MCP_TOKEN_ENV]).toBe(MCP_TOKEN);
    expect(JSON.stringify(seen[0]?.config)).not.toContain(MCP_TOKEN);
    expect(threads[0]).toMatchObject({
      model: "gpt-6-astra",
      modelReasoningEffort: "medium",
      sandboxMode: CODEX_SANDBOX,
      approvalPolicy: "never",
      webSearchMode: "disabled",
      skipGitRepoCheck: true,
      threadSource: "aven",
    });
    expect(threads[1]).toMatchObject({
      model: "gpt-6.1-terra",
      modelReasoningEffort: "high",
      resumed: "sess-1",
    });
    const config = codexClientConfig("http://127.0.0.1:9/mcp");
    expect(config.mcp_servers.aven.tool_timeout_sec).toBe(86_400);
    expect(config.mcp_servers.aven.bearer_token_env_var).toBe(CODEX_MCP_TOKEN_ENV);
  });
});

async function* streamOf(events: CodexSdkEvent[]) {
  for (const event of events) yield event;
}

function emptyUsage() {
  return {
    input_tokens: 1,
    cached_input_tokens: 0,
    cache_write_input_tokens: 0,
    output_tokens: 1,
    reasoning_output_tokens: 0,
  };
}

function input(extra: Partial<CodexQueryInput> = {}): CodexQueryInput {
  return {
    prompt: "look",
    images: [],
    token: TOKEN,
    cwd: "/work",
    codexHome: "/runner/codex/thread",
    mcpUrl: "http://127.0.0.1:9/mcp",
    mcpToken: MCP_TOKEN,
    abortController: new AbortController(),
    tools: {},
    env: [],
    redact: (text) => text,
    ...extra,
  };
}
