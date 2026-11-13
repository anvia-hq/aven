import { NotFoundError } from "@aven/server-kit/errors";
import { WAKE_TIMEOUT_MS } from "../computer/service";
import { createFilesService } from "../files/service";
import { runnerFor } from "../runtimes/ask-runner";
import { ACTIONS_FILE, parseActions } from "./parse";
import { actionRunAnswer } from "./schema";
import type { RuntimeHub } from "../runtimes/hub";
import type { ActionStarted, ActionsDeps, ParsedActions, StartActionInput } from "./types";

export function createActionsService(
  hub: RuntimeHub,
  { send, readFile = createFilesService(hub).read }: ActionsDeps,
) {
  const runner = runnerFor(hub);

  async function read(organizationId: string, threadId: string): Promise<ParsedActions> {
    const file = await readFile(organizationId, threadId, ACTIONS_FILE);

    if (!file.available || file.kind === "missing") return { actions: [], problem: null };

    if (file.kind !== "text" || file.truncated) {
      return { actions: [], problem: "The file is not readable text or is too long" };
    }

    return parseActions(file.text);
  }

  return {
    async list(organizationId: string, threadId: string) {
      const { actions, problem } = await read(organizationId, threadId);
      return { actions: actions.map(({ name, kind }) => ({ name, kind })), problem };
    },

    async start(
      organizationId: string,
      userId: string,
      threadId: string,
      { name, ...selection }: StartActionInput,
    ): Promise<ActionStarted> {
      const { actions } = await read(organizationId, threadId);
      const action = actions.find((candidate) => candidate.name === name);

      if (!action) throw new NotFoundError("This repository has no such action");

      if (action.kind === "prompt") {
        await send(organizationId, userId, threadId, { prompt: action.body, ...selection });
        return { kind: "prompt" };
      }

      const { process } = await runner.ask(
        organizationId,
        "actions.run",
        { threadId, command: action.body },
        actionRunAnswer,
        { logged: "The actions.run call was refused:", message: "The action could not be started" },
        WAKE_TIMEOUT_MS,
      );
      return { kind: "run", process };
    },
  };
}
