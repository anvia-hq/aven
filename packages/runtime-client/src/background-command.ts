import type { AnyTool } from "@anvia/core";
import { asRecord } from "@aven/agents/values";

const BACKGROUND_DESCRIPTION =
  "Run the command in the background: it starts and the call returns at once with a process id, instead of waiting for it to finish. Use it for a dev server, a watcher, or anything that keeps running. You are told when it ends, with a [process] message that wakes you when your turn is over, so for a long job you can end your turn instead of waiting. Read what it prints with read_process_logs, look at it with list_processes and stop it with stop_process; the user sees it under Background tasks and can stop it too. timeoutMs and input do not apply to it.";

const invalid = (message: string) => new Error(message);

const DETACH_PATTERN = /(^|[\s;&|(`])(nohup|setsid|disown)(?=\s|$|;|\))|(^|[^&>])&[ \t]*(;|\n|$)/;

const DETACHED_MESSAGE =
  "Do not detach a command with nohup, setsid, disown or a trailing &: it runs where Aven cannot see it, so it is missing from Background tasks and nobody is told when it ends. Run it again with background: true.";

const refuseDetached = (rest: Record<string, unknown>) => {
  const args = Array.isArray(rest.args) ? rest.args.filter((arg) => typeof arg === "string") : [];
  const text = [typeof rest.command === "string" ? rest.command : "", ...args].join("\n");

  if (DETACH_PATTERN.test(text)) throw invalid(DETACHED_MESSAGE);
};

export function withBackground(exec: AnyTool, start: AnyTool): AnyTool {
  return {
    name: exec.name,
    requiresApproval: exec.requiresApproval,
    async definition(prompt) {
      const base = await exec.definition(prompt);
      const properties = asRecord(base.parameters.properties);
      return {
        ...base,
        parameters: {
          ...base.parameters,
          properties: {
            ...properties,
            background: { type: "boolean", description: BACKGROUND_DESCRIPTION },
          },
        },
      } as typeof base;
    },
    parseInput(args) {
      const { background, ...rest } = asRecord(args);

      if (background !== undefined && typeof background !== "boolean") {
        throw invalid("background must be true or false");
      }

      refuseDetached(rest);

      if (background !== true) return exec.parseInput ? exec.parseInput(rest as never) : rest;

      if ("timeoutMs" in rest || "input" in rest) {
        throw invalid("timeoutMs and input do not apply to a command run in the background");
      }

      const parsed = start.parseInput ? start.parseInput(rest as never) : rest;
      return { ...asRecord(parsed), background: true };
    },
    async call(args, context) {
      const { background, ...rest } = asRecord(args);

      if (background !== true) return exec.call(rest, context);

      const started = asRecord(await start.call(rest, context));
      const id = typeof started.id === "string" ? started.id : "unknown";
      return `Started in the background as process ${id}. It keeps running after this call; you are told with a [process] message when it ends. Read its output with read_process_logs, check on it with list_processes, stop it with stop_process. The user sees it under Background tasks.`;
    },
  };
}
