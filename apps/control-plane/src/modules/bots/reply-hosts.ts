import { parseBotPrompt } from "@aven/protocol/bots";
import { providerKeyQuestion } from "@aven/protocol/providers";
import { BOT_THREAD_RUNS_PER_REPLY } from "@aven/protocol/threads";
import { isWebhookNote } from "@aven/protocol/webhooks";

import { API_CALLS_PER_REPLY } from "../bot-api/service";
import { runCockpitCommand } from "../cockpit/commands";
import type { ReplyHosts, ReplyHostsInput } from "./types";

const THEIR_WORD = "only when the person asks you to, in their own message";

export function replyHosts({
  bot,
  userId,
  prompt,
  hops,
  onPersonsWord,
  aboutThread,
  memoryOwner,
  ask,
  bots,
  mcp,
  providers,
  threads,
  notes,
  world,
}: ReplyHostsInput): ReplyHosts {
  const { from, note } = parseBotPrompt(prompt);
  const onTheirWord = onPersonsWord && from === undefined;
  const onWebhook = bot.isMain && isWebhookNote(prompt);
  const inspected = new Set<string>();
  let threadRuns = 0;
  let apiCalls = 0;
  let asked = false;

  const guardThread = (op: "start" | "archive" | "continue" | "stop" | "answer", id = "") => {
    if (onTheirWord) return;

    if (op === "answer") throw new Error(`Answer a thread's question ${THEIR_WORD}`);

    if (op === "start" || op === "archive") {
      if (op === "start" && onWebhook) return;

      throw new Error(`Start or archive threads ${THEIR_WORD}`);
    }

    if (!note) throw new Error(`Continue or stop a thread ${THEIR_WORD}`);

    if (id !== aboutThread) {
      throw new Error(`This note is not about that thread: continue or stop it ${THEIR_WORD}`);
    }

    if (!inspected.has(id)) {
      throw new Error(
        "Look at the thread with get_thread first, in this reply: act on where it is now, not on the note",
      );
    }
  };

  const runThread = () => {
    if (threadRuns >= BOT_THREAD_RUNS_PER_REPLY) {
      throw new Error(
        `You have started, continued or stopped threads ${BOT_THREAD_RUNS_PER_REPLY} times in this reply. Tell the person what is left.`,
      );
    }

    threadRuns += 1;
    return onTheirWord ? ("person" as const) : ("note" as const);
  };

  return {
    createBot: async ({ name, instruction, description }) => {
      if (!bot.isMain) throw new Error("Only your main bot can make bots");

      if (!onTheirWord) throw new Error(`Make a bot ${THEIR_WORD}`);

      const made = await bots.create(userId, { name, instruction, description });
      bots.greet(userId, made.id, hops).catch((error: unknown) => {
        console.warn(`Bot ${made.id} could not greet its person:`, error);
      });
      return { id: made.id, name: made.name, handle: made.handle };
    },

    deleteBot: async ({ handle }) => {
      if (!bot.isMain) throw new Error("Only your main bot can delete bots");

      if (!onTheirWord) throw new Error(`Delete a bot ${THEIR_WORD}`);

      const target = (await bots.list(userId)).find((each) => each.handle === handle);

      if (!target) throw new Error(`No bot with the handle "${handle}". Use list_bots.`);

      if (target.isMain) throw new Error("The main bot cannot be deleted");

      await bots.remove(userId, target.id);
      return { name: target.name, handle: target.handle };
    },

    updateSelf: async ({ name, description, instruction }) => {
      if (!onPersonsWord) {
        throw new Error(
          "Change yourself only when the person asks you to, or the main bot passes it on",
        );
      }

      const changed = await bots.update(userId, bot.id, { name, description, instruction });

      if (!changed) throw new Error("This bot no longer exists");

      return { name: changed.name, description: changed.description };
    },

    schedules: {
      list: async () => bots.schedules.list(userId),
      create: async ({ name, cron, prompt: task, timezone, bot: target }) => {
        if (!onPersonsWord) {
          throw new Error(
            "Change schedules only when the person asks you to, or the main bot passes it on",
          );
        }

        return bots.schedules.create(userId, bot.id, {
          name,
          cron,
          prompt: task,
          timezone,
          bot: target,
        });
      },
      update: async (id, { name, cron, prompt: task, timezone, enabled, bot: target }) => {
        if (!onPersonsWord) {
          throw new Error(
            "Change schedules only when the person asks you to, or the main bot passes it on",
          );
        }

        return bots.schedules.update(userId, id, {
          name,
          cron,
          prompt: task,
          timezone,
          enabled,
          bot: target,
        });
      },
      remove: async (id) => {
        if (!onPersonsWord) {
          throw new Error(
            "Change schedules only when the person asks you to, or the main bot passes it on",
          );
        }

        await bots.schedules.remove(userId, id);
      },
    },

    mcpServers: {
      list: async () => mcp.list(userId),
      add: async ({ name, url, headers, target }) => {
        if (!onTheirWord) throw new Error(`Change MCP servers ${THEIR_WORD}`);

        return mcp.add(userId, { name, url, headers, target });
      },
      update: async (id, { name, url, headers, target, enabled }) => {
        if (!onTheirWord) throw new Error(`Change MCP servers ${THEIR_WORD}`);

        return mcp.update(userId, id, { name, url, headers, target, enabled });
      },
      remove: async (id) => {
        if (!onTheirWord) throw new Error(`Change MCP servers ${THEIR_WORD}`);

        await mcp.remove(userId, id);
      },
    },

    providers: {
      list: async () => providers.list(userId),
      models: async (id) => (await providers.models(userId, id)).models,
      add: async ({ kind, name, baseUrl, modelId, isDefault }) => {
        if (!onTheirWord) throw new Error(`Change providers ${THEIR_WORD}`);

        return providers.add(userId, { kind, name, baseUrl, modelId, isDefault });
      },
      update: async (id, { name, baseUrl, modelId, isDefault }) => {
        if (!onTheirWord) throw new Error(`Change providers ${THEIR_WORD}`);

        return providers.update(userId, id, { name, baseUrl, modelId, isDefault });
      },
      remove: async (id) => {
        if (!onTheirWord) throw new Error(`Change providers ${THEIR_WORD}`);

        await providers.remove(userId, id);
      },
      askKey: async (id) => {
        if (note || (!bot.isMain && from !== undefined)) {
          throw new Error("Nobody is there to type a key: this was not the person's message");
        }

        if (asked) throw new Error("You have already asked. Stop now and wait for the answer.");

        const key = await providers.keyFor(userId, id);
        asked = true;
        ask([providerKeyQuestion(key)]);
        return key;
      },
    },

    threads: {
      projects: async () => threads.projects(userId),
      list: async (filter) =>
        threads.list(userId, { projectId: filter.projectId, archived: filter.archived }),
      get: async (id) => {
        const seen = await threads.get(userId, id);
        inspected.add(id);
        return seen;
      },
      start: async (input) => {
        guardThread("start");
        const via = runThread();
        return threads.start(
          { userId, botId: bot.id, via },
          {
            projectId: input.projectId,
            prompt: input.prompt,
            title: input.title,
            providerId: input.providerId,
            modelId: input.modelId,
            reasoningEffort: input.reasoningEffort,
          },
        );
      },
      continue: async (id, input) => {
        guardThread("continue", id);
        const via = runThread();
        return threads.continue({ userId, botId: bot.id, via }, id, {
          prompt: input.prompt,
          providerId: input.providerId,
          modelId: input.modelId,
          reasoningEffort: input.reasoningEffort,
        });
      },
      archive: async (id, archived) => {
        guardThread("archive", id);
        return threads.archive(
          { userId, botId: bot.id, via: onTheirWord ? "person" : "note" },
          id,
          archived,
        );
      },
      stop: async (id) => {
        guardThread("stop", id);
        const via = runThread();
        return threads.stop({ userId, botId: bot.id, via }, id);
      },
      answer: async (id, input) => {
        guardThread("answer", id);
        return threads.answer({ userId, botId: bot.id, via: "person" }, id, input);
      },
    },

    api: async (params) => {
      if (params.op === "call") {
        apiCalls += 1;

        if (apiCalls > API_CALLS_PER_REPLY) {
          throw new Error(
            `You have made ${API_CALLS_PER_REPLY} API calls in this reply. Tell the person what is left.`,
          );
        }
      }

      return bots.api.answer({ userId, params, onPersonsWord: onTheirWord });
    },

    notes: (command) =>
      notes.run(
        { owner: memoryOwner, actor: { source: "bot", botId: bot.id }, writable: onPersonsWord },
        command,
      ),

    cockpit: (command) => runCockpitCommand({ userId, access: "write", onPersonsWord }, command),

    projectFiles: {
      folder: (projectId, path) => world.folder(userId, projectId, path),
      file: (projectId, path) => world.file(userId, projectId, path),
    },

    asked: () => asked,
    takeAsked: () => {
      asked = true;
    },
  };
}
