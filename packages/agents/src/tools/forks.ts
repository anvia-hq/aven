import { createTool } from "@anvia/core";
import { FORKS_PER_THREAD, FORK_TEXT_MAX } from "@aven/protocol/forks";
import { z } from "zod";

import { createWaitForForksTool } from "./wait-for-forks";
import type { ForkHost } from "./types";
import type { ForkView } from "@aven/protocol/types";

export const FORK_THREAD_TOOL_NAME = "fork_thread";
export const FORK_STATUS_TOOL_NAME = "fork_status";
export const TAKE_FORK_CHANGES_TOOL_NAME = "take_fork_changes";
export const STOP_FORK_TOOL_NAME = "stop_fork";

const forkId = z.uuid().describe("The id fork_thread gave you.");
const FORK_MESSAGE_MAX = 2_000;
const MAX_TAKEN_FILES = 100;

function forkState(view: Pick<ForkView, "running" | "error">) {
  if (view.running) return "running";

  return view.error ? `failed (${view.error})` : "stopped";
}

function formatForkView(view: ForkView) {
  const state = forkState(view);
  const lines = [`Fork ${view.id} (${view.title}): ${state}${view.archived ? ", archived" : ""}`];
  const trimmed = view.lastMessage.trim();

  if (trimmed) {
    lines.push(
      trimmed.length > FORK_MESSAGE_MAX ? `…${trimmed.slice(-FORK_MESSAGE_MAX)}` : trimmed,
    );
  }

  return lines.join("\n");
}

export function createForkTools(host: ForkHost) {
  const forkThread = createTool({
    name: FORK_THREAD_TOOL_NAME,
    description: `Fork this thread: start another thread that works on one task apart from you, in a folder of its own that begins as a copy of your workspace, uncommitted changes included. It does not share your files, processes or conversation, so what you do next does not touch it and what it does does not touch you. Returns at once; it keeps working while you do.

Use it only when the user asks you to fork or to work on something in parallel. Never on your own: it costs a whole clone. At most ${FORKS_PER_THREAD} forks that are not archived, and a fork cannot fork.
- \`task\` is what it must do, and what to send back.
- \`context\` is a summary of what you know that the task needs: what the user wants, what you have done, learned and decided, the files that matter and what is already failing. The fork has none of your conversation, only this.
- Look at it with fork_status, and take what it changed with take_fork_changes.`,
    inputSchema: z.object({
      task: z
        .string()
        .trim()
        .min(1)
        .max(FORK_TEXT_MAX)
        .describe("What the fork must do, and what to report."),
      context: z
        .string()
        .trim()
        .min(1)
        .max(FORK_TEXT_MAX)
        .describe("A summary of what you know that the task needs."),
      title: z
        .string()
        .trim()
        .min(1)
        .max(120)
        .optional()
        .describe("A short name shown in the sidebar."),
    }),
    handler: async (input) => {
      const started = await host.start(input);
      return `Forked "${started.title}" (${started.id}). It is working in its own thread; check it with fork_status.`;
    },
  });

  const forkStatus = createTool({
    name: FORK_STATUS_TOOL_NAME,
    description:
      "Look at a fork of this thread: whether it is working, why it failed if it did, and the last thing its agent said, which is its report once it is done.",
    inputSchema: z.object({ id: forkId }),
    handler: async ({ id }) => formatForkView(await host.status(id)),
  });

  const stopFork = createTool({
    name: STOP_FORK_TOOL_NAME,
    description:
      "Stop a fork of this thread that is working, as the person's Stop button does: its current run is cancelled. The fork stays as a thread under this one, what it already did stays in its folder (take_fork_changes still reads it), and it can be given a new message later. Use it when the user asks you to stop, cancel or abandon a fork.",
    inputSchema: z.object({ id: forkId }),
    handler: async ({ id }) => {
      const view = await host.stop(id);
      let note = "The fork was not working, so nothing was stopped.";

      if (view.stopped) note = "The fork's run was cancelled.";
      else if (view.running) {
        note =
          "The fork is still working: it could not be stopped. Tell the user to stop it from the sidebar.";
      }

      return `${note} (Fork ${view.id}: ${view.title})`;
    },
  });

  const takeForkChanges = createTool({
    name: TAKE_FORK_CHANGES_TOOL_NAME,
    description: `Take what a fork changed: everything it changed since it was forked, committed or not, as a patch file in your workspace. Read it, and apply it with \`git apply --3way <patchPath>\` (or \`git apply --check\` first) in /workspace; nothing is applied for you. It can be called while the fork still works, and again for what it has done since.`,
    inputSchema: z.object({ id: forkId }),
    handler: async ({ id }) => {
      const taken = await host.take(id);

      if (taken.empty) return "The fork has no changes.";

      const shown = taken.files.slice(0, MAX_TAKEN_FILES);
      const more =
        taken.files.length > MAX_TAKEN_FILES
          ? `\n[${taken.files.length - MAX_TAKEN_FILES} more files not shown]`
          : "";
      return `Patch written to ${taken.patchPath} (${taken.files.length} files):\n${shown.join("\n")}${more}`;
    },
  });

  return [
    forkThread,
    forkStatus,
    stopFork,
    createWaitForForksTool((id) => host.status(id)),
    takeForkChanges,
  ];
}
