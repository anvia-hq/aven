import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { AVEN_NOTE } from "@aven/agent-backend/hosted-helpers";
import { withoutRunnerSecrets } from "@aven/agent-backend/runner-secrets";
import type { BackendImage } from "@aven/agent-backend/types";
import { parseCodexAuth } from "@aven/protocol/codex-auth";
import { CODEX_DEFAULT_EFFORT, codexEffortOf, codexResolvedOf } from "@aven/protocol/codex-models";
import type { RunEnvVar } from "@aven/protocol/types";
import type { Codex, ModelReasoningEffort, SandboxMode } from "@openai/codex-sdk";

import type { CodexClientConfig, CodexLoader, CodexQuery, CodexQueryInput } from "./types";

const BLOCKED_ENV_PREFIXES = ["OPENAI_", "CODEX_"];

export const CODEX_MCP_TOKEN_ENV = "AVEN_CODEX_MCP_TOKEN";

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

const isBlockedEnv = (name: string) =>
  BLOCKED_ENV_PREFIXES.some((prefix) => name.toUpperCase().startsWith(prefix));

export const CODEX_DISABLED_FEATURES = { shell_tool: false } as const;

export const CODEX_SANDBOX: SandboxMode = "read-only";

export function codexProcessEnv(
  project: readonly RunEnvVar[],
  token: string,
  codexHome: string,
  mcpToken: string,
  inherited: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const fromProject: Record<string, string> = {};
  for (const { name, value } of project) {
    if (!isBlockedEnv(name)) fromProject[name] = value;
  }
  const key: Record<string, string> = parseCodexAuth(token) ? {} : { CODEX_API_KEY: token };
  return {
    ...withoutRunnerSecrets(inherited),
    ...fromProject,
    ...key,
    CODEX_HOME: codexHome,
    [CODEX_MCP_TOKEN_ENV]: mcpToken,
  };
}

export function codexClientConfig(mcpUrl: string): CodexClientConfig {
  return {
    mcp_servers: {
      aven: {
        url: mcpUrl,
        tool_timeout_sec: 86_400,
        default_tools_approval_mode: "approve",
        bearer_token_env_var: CODEX_MCP_TOKEN_ENV,
      },
    },
    features: CODEX_DISABLED_FEATURES,
  };
}

export function promptOf(input: Pick<CodexQueryInput, "prompt" | "instructions" | "sessionId">) {
  if (input.sessionId) return input.prompt;

  return [AVEN_NOTE, input.instructions, input.prompt]
    .filter((part) => part && part.length > 0)
    .join("\n\n");
}

export async function imagePaths(home: string, images: readonly BackendImage[]) {
  const paths: string[] = [];

  if (images.length === 0) return paths;

  const dir = join(home, "images");
  mkdirSync(dir, { recursive: true });
  for (const image of images) {
    const extension = IMAGE_EXTENSIONS[image.mediaType];

    if (!extension) continue;

    const path = join(dir, `${crypto.randomUUID()}.${extension}`);
    await Bun.write(path, Buffer.from(image.data, "base64"));
    paths.push(path);
  }
  return paths;
}

export function writeCodexAuth(codexHome: string, token: string) {
  if (!parseCodexAuth(token)) return;

  writeFileSync(join(codexHome, "auth.json"), token.trim(), { mode: 0o600 });
}

export function readCodexAuth(codexHome: string): string | undefined {
  try {
    const text = readFileSync(join(codexHome, "auth.json"), "utf8");

    return parseCodexAuth(text) ? text.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function removeCodexAuth(codexHome: string) {
  try {
    rmSync(join(codexHome, "auth.json"), { force: true });
  } catch {
    void 0;
  }
}

const loadSdk: CodexLoader = async (options) => {
  const sdk = await import("@openai/codex-sdk");
  return new sdk.Codex(options) as Codex;
};

function threadOptions(input: CodexQueryInput) {
  const effort = (codexEffortOf(input.effort) ?? CODEX_DEFAULT_EFFORT) as ModelReasoningEffort;
  return {
    model: codexResolvedOf(input.model),
    modelReasoningEffort: effort,
    workingDirectory: input.cwd,
    skipGitRepoCheck: true,
    sandboxMode: CODEX_SANDBOX,
    approvalPolicy: "never" as const,
    webSearchMode: "disabled" as const,
    threadSource: "aven",
  };
}

export function createCodexQuery(load: CodexLoader = loadSdk): CodexQuery {
  return (input) => {
    const abort = input.abortController;
    const stream = (async function* () {
      mkdirSync(input.codexHome, { recursive: true });
      writeCodexAuth(input.codexHome, input.token);
      const codex = await load({
        apiKey: parseCodexAuth(input.token) ? undefined : input.token,
        env: codexProcessEnv(input.env, input.token, input.codexHome, input.mcpToken),
        config: codexClientConfig(input.mcpUrl),
        codexPathOverride: process.env.CODEX_PATH,
      });
      const options = threadOptions(input);
      const thread = input.sessionId
        ? codex.resumeThread(input.sessionId, options)
        : codex.startThread(options);
      const paths = await imagePaths(input.codexHome, input.images);
      const text = promptOf(input);
      const body =
        paths.length > 0
          ? [
              { type: "text" as const, text },
              ...paths.map((path) => ({ type: "local_image" as const, path })),
            ]
          : text;
      try {
        const { events } = await thread.runStreamed(body, { signal: abort.signal });
        for await (const event of events) {
          if (event && typeof event === "object" && "type" in event) yield event;
        }
      } finally {
        await Promise.all(paths.map((path) => rm(path, { force: true })));
      }
    })();
    return Object.assign(stream, {
      close() {
        abort.abort();
      },
    });
  };
}

export const codexSdkQuery: CodexQuery = createCodexQuery();
