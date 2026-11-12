import { mkdirSync } from "node:fs";

import { claudeExecutable } from "./claude-binary";
import { claudeMcpTools } from "./claude-mcp";
import { withoutRunnerSecrets } from "./runner-secrets";
import type { ClaudePromptItem, ClaudeQuery, ClaudeSdkMessage } from "./types";
import type { RunEnvVar } from "@aven/protocol/types";
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk";

const AVEN_NOTE =
  "You are running inside Aven, on the person's computer, in this thread's folder. Call the aven MCP tools for files, commands, git, processes, artifacts, memory, questions and goals. ask_user and request_secret pause the run until the person answers. Do not use a built-in shell or file tool.";

export const CLAUDE_DISALLOWED_TOOLS = [
  "Bash",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "Task",
  "NotebookEdit",
  "TodoWrite",
  "Skill",
  "AskUserQuestion",
];

const BLOCKED_ENV_PREFIXES = ["ANTHROPIC_", "CLAUDE_"];

const isBlockedEnv = (name: string) =>
  BLOCKED_ENV_PREFIXES.some((prefix) => name.toUpperCase().startsWith(prefix));

export function claudeProcessEnv(
  project: readonly RunEnvVar[],
  token: string,
  configDir: string,
  inherited: Record<string, string | undefined> = process.env,
  extra: Record<string, string> = {},
): Record<string, string> {
  const fromProject: Record<string, string> = {};
  for (const { name, value } of project) {
    if (!isBlockedEnv(name)) fromProject[name] = value;
  }
  return {
    ...withoutRunnerSecrets(inherited),
    ...fromProject,
    CLAUDE_CODE_OAUTH_TOKEN: token,
    CLAUDE_CONFIG_DIR: configDir,
    CLAUDE_AGENT_SDK_CLIENT_APP: "aven",
    ...extra,
  };
}

type UserBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
        data: string;
      };
    };

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

const imageType = (mediaType: string) => IMAGE_TYPES.find((type) => type === mediaType);

function contentOf(item: ClaudePromptItem): string | UserBlock[] {
  if (typeof item === "string") return item;

  const blocks: UserBlock[] = [{ type: "text", text: item.text }];

  for (const { mediaType, data } of item.images) {
    const media_type = imageType(mediaType);

    if (media_type) blocks.push({ type: "image", source: { type: "base64", media_type, data } });
  }
  return blocks.length === 1 ? item.text : blocks;
}

function userMessages(prompts: AsyncIterable<ClaudePromptItem>): AsyncIterable<{
  type: "user";
  message: { role: "user"; content: string | UserBlock[] };
  parent_tool_use_id: null;
}> {
  return {
    async *[Symbol.asyncIterator]() {
      for await (const item of prompts) {
        yield {
          type: "user",
          message: { role: "user", content: contentOf(item) },
          parent_tool_use_id: null,
        };
      }
    },
  };
}

export const claudeSdkQuery: ClaudeQuery = (input) => {
  let closeQuery: (() => void) | undefined;
  const stream = (async function* () {
    mkdirSync(input.configDir, { recursive: true });
    const executable = await claudeExecutable({ dir: input.binaryDir });
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    const own = await claudeMcpTools(input.tools);
    const server = sdk.createSdkMcpServer({
      name: "aven",
      version: "1.0.0",
      tools: own.map((item) =>
        sdk.tool(item.name, item.description, item.shape, async (args) => item.handler(args)),
      ),
    });
    const extra: Record<string, string> = {};

    if (input.resumeInterrupted) extra.CLAUDE_CODE_RESUME_INTERRUPTED_TURN = "1";

    const append = [AVEN_NOTE, input.instructions]
      .filter((part) => part && part.length > 0)
      .join("\n\n");
    const options = {
      cwd: input.cwd,
      pathToClaudeCodeExecutable: executable,
      resume: input.sessionId,
      abortController: input.abortController,
      permissionMode: "bypassPermissions" as const,
      allowDangerouslySkipPermissions: true,
      settingSources: [] as [],
      includePartialMessages: true,
      persistSession: true,
      mcpServers: { aven: server },
      allowedTools: own.map((item) => `mcp__aven__${item.name}`),
      tools: [] as string[],
      disallowedTools: CLAUDE_DISALLOWED_TOOLS,
      env: claudeProcessEnv(input.env, input.token, input.configDir, process.env, extra),
      systemPrompt: {
        type: "preset" as const,
        preset: "claude_code" as const,
        append,
        excludeDynamicSections: true,
      },
      maxTurns: input.maxTurns,
      model: input.model,
      effort: input.effort as EffortLevel | undefined,
    };
    const query = sdk.query({ prompt: userMessages(input.prompt), options });
    closeQuery = () => query.close();
    let planUsage: ClaudeSdkMessage | undefined;
    void Promise.resolve()
      .then(() =>
        query.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }),
      )
      .then(
        (usage) => {
          planUsage = { type: "plan_limits", usage };
        },
        () => undefined,
      );

    for await (const message of query) {
      const mapped = asSdkMessage(message);

      if (mapped) yield mapped;

      if (planUsage) {
        const ready = planUsage;
        planUsage = undefined;
        yield ready;
      }
    }
  })();
  return Object.assign(stream, {
    close() {
      closeQuery?.();
      input.abortController.abort();
    },
  });
};

function asSdkMessage(message: unknown): ClaudeSdkMessage | undefined {
  const record = message as { type?: unknown };

  if (
    record?.type === "assistant" ||
    record?.type === "user" ||
    record?.type === "result" ||
    record?.type === "system" ||
    record?.type === "rate_limit_event" ||
    record?.type === "stream_event"
  ) {
    return message as ClaudeSdkMessage;
  }

  return undefined;
}
