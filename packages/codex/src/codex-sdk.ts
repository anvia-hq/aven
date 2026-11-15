import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { CODEX_DEFAULT_EFFORT, codexEffortOf, codexResolvedOf } from "@aven/protocol/codex-models";
import { withoutRunnerSecrets } from "@aven/agent-backend/runner-secrets";
import type {
  CodexImage,
  CodexQuery,
  CodexQueryInput,
  CodexSdkEvent,
} from "@aven/agent-backend/types";
import type { RunEnvVar } from "@aven/protocol/types";
import type { Codex, ModelReasoningEffort, SandboxMode } from "@openai/codex-sdk";

const AVEN_NOTE =
  "You are running inside Aven, on the person's computer, in this thread's folder. Call the aven MCP tools for files, commands, git, processes, artifacts, memory, questions and goals. ask_user and request_secret pause the run until the person answers. Do not use a built-in shell or file tool.";

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
  return {
    ...withoutRunnerSecrets(inherited),
    ...fromProject,
    CODEX_API_KEY: token,
    CODEX_HOME: codexHome,
    [CODEX_MCP_TOKEN_ENV]: mcpToken,
  };
}

export function codexClientConfig(mcpUrl: string) {
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

export async function imagePaths(home: string, images: readonly CodexImage[]) {
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

type CodexLike = {
  startThread(options: Record<string, unknown>): {
    runStreamed(
      input: unknown,
      turn?: { signal?: AbortSignal },
    ): Promise<{ events: AsyncIterable<CodexSdkEvent> }>;
  };
  resumeThread(
    id: string,
    options: Record<string, unknown>,
  ): {
    runStreamed(
      input: unknown,
      turn?: { signal?: AbortSignal },
    ): Promise<{ events: AsyncIterable<CodexSdkEvent> }>;
  };
};

export type CodexLoader = (options: {
  apiKey: string;
  env: Record<string, string>;
  config: ReturnType<typeof codexClientConfig>;
  codexPathOverride?: string;
}) => Promise<CodexLike>;

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
      const codex = await load({
        apiKey: input.token,
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
      const { events } = await thread.runStreamed(body, { signal: abort.signal });
      for await (const event of events) {
        if (event && typeof event === "object" && "type" in event) yield event;
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
