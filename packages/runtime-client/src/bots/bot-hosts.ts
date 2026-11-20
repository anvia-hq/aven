import type { AnyTool } from "@anvia/core";
import type {
  GoalHost,
  McpServersHost,
  ProjectFilesHost,
  ProvidersHost,
  ScheduleHost,
  ThreadsHost,
} from "@aven/agents/tools/types";
import type {
  BotGoalView,
  BotMcpView,
  BotProjectEntry,
  BotProjectView,
  BotProviderView,
  BotScheduleView,
  BotThreadDetail,
  BotThreadView,
  ProviderKeyAsk,
} from "@aven/protocol/types";

import { verifyWith } from "../runs/goal-assessment";
import type { BotRepliesContext } from "../types";

export function createBotRpcHosts({
  replyId,
  call,
  exec,
  canAskPerson,
  hasProjects,
  spoke,
}: {
  replyId: string;
  call: BotRepliesContext["call"];
  exec: AnyTool | undefined;
  canAskPerson: boolean;
  hasProjects: boolean;
  spoke: () => void;
}): {
  goals: GoalHost;
  schedules: ScheduleHost;
  mcpServers: McpServersHost;
  providers: ProvidersHost;
  threads: ThreadsHost;
  projectFiles: ProjectFilesHost | undefined;
} {
  return {
    goals: {
      get: async () => (await call("bot.goal", { replyId, op: "get" })) as BotGoalView | null,
      start: async (input) =>
        (await call("bot.goal", { replyId, op: "start", ...input })) as BotGoalView,
      update: async (action, reason) =>
        (await call("bot.goal", { replyId, op: "update", action, reason })) as BotGoalView | null,
      check: async (checks, signal) => {
        const failed: string[] = [];
        for (const check of checks) {
          signal?.throwIfAborted();
          const [result] = await verifyWith(exec, [check])();

          if (result && result.exitCode !== 0) {
            const how = result.exitCode === null ? "timed out" : `exited ${result.exitCode}`;
            failed.push(`$ ${result.command}\n(${how})\n${result.output}`.trimEnd());
          }
        }
        return failed;
      },
    },
    schedules: {
      list: async () => (await call("bot.schedule", { replyId, op: "list" })) as BotScheduleView[],
      create: async (input) =>
        (await call("bot.schedule", { replyId, op: "create", ...input })) as BotScheduleView,
      update: async (id, patch) =>
        (await call("bot.schedule", { replyId, op: "update", id, ...patch })) as BotScheduleView,
      remove: async (id) => void (await call("bot.schedule", { replyId, op: "delete", id })),
    },
    mcpServers: {
      list: async () => (await call("bot.mcp", { replyId, op: "list" })) as BotMcpView[],
      add: async (input) => (await call("bot.mcp", { replyId, op: "add", ...input })) as BotMcpView,
      update: async (id, patch) =>
        (await call("bot.mcp", { replyId, op: "update", id, ...patch })) as BotMcpView,
      remove: async (id) => void (await call("bot.mcp", { replyId, op: "remove", id })),
    },
    providers: {
      list: async () => (await call("bot.provider", { replyId, op: "list" })) as BotProviderView[],
      add: async (input) =>
        (await call("bot.provider", { replyId, op: "add", ...input })) as BotProviderView,
      update: async (id, patch) =>
        (await call("bot.provider", { replyId, op: "update", id, ...patch })) as BotProviderView,
      remove: async (id) => void (await call("bot.provider", { replyId, op: "remove", id })),
      models: async (id) =>
        ((await call("bot.provider", { replyId, op: "models", id })) as { models: string[] })
          .models,
      askKey: canAskPerson
        ? async (id) => {
            spoke();
            return (await call("bot.provider", { replyId, op: "askKey", id })) as ProviderKeyAsk;
          }
        : undefined,
    },
    threads: {
      projects: async () =>
        (await call("bot.thread", { replyId, op: "projects" })) as BotProjectView[],
      list: async (filter) =>
        (await call("bot.thread", { replyId, op: "list", ...filter })) as BotThreadView[],
      get: async (id) => (await call("bot.thread", { replyId, op: "get", id })) as BotThreadDetail,
      start: async (input) =>
        (await call("bot.thread", { replyId, op: "start", ...input })) as BotThreadView,
      continue: async (id, input) =>
        (await call("bot.thread", { replyId, op: "continue", id, ...input })) as BotThreadView,
      archive: async (id, archived) =>
        (await call("bot.thread", { replyId, op: "archive", id, archived })) as BotThreadView,
      stop: async (id) => (await call("bot.thread", { replyId, op: "stop", id })) as BotThreadView,
      answer: async (id, input) =>
        (await call("bot.thread", { replyId, op: "answer", id, ...input })) as BotThreadView,
    },
    projectFiles: hasProjects
      ? {
          folder: async (projectId, path) =>
            (
              (await call("bot.project", { replyId, op: "folder", projectId, path })) as {
                entries: BotProjectEntry[];
              }
            ).entries,
          file: async (projectId, path) =>
            (await call("bot.project", { replyId, op: "file", projectId, path })) as {
              path: string;
              text: string;
              truncated: boolean;
            },
        }
      : undefined,
  };
}
