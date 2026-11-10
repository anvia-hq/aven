import { ConflictError, UnavailableError } from "../../errors";
import { runnerFor } from "../runtimes/ask-runner";
import { environmentSaveAnswer } from "./schema";
import type { EnvironmentDeps, SnapshotState } from "./types";

export const SAVE_TIMEOUT_MS = 30 * 60_000;

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createEnvironmentService(
  runner: Pick<ReturnType<typeof runnerFor>, "ask">,
  { repoAccess, now = () => new Date() }: EnvironmentDeps,
) {
  const states = new Map<string, SnapshotState>();

  const stateOf = (threadId: string): SnapshotState => states.get(threadId) ?? { state: "idle" };

  return {
    state: stateOf,

    async snapshot(organizationId: string, threadId: string): Promise<SnapshotState> {
      if (stateOf(threadId).state === "running") {
        throw new ConflictError("A snapshot is already being taken");
      }
      const before = stateOf(threadId);
      states.set(threadId, {
        state: "running",
        startedAt: now().toISOString(),
        savedAt: before.savedAt,
      });
      const access = await repoAccess(threadId).catch((error: unknown) => {
        states.set(threadId, before);
        throw error;
      });
      void runner
        .ask(
          organizationId,
          "environment.save",
          { threadId, organizationId, access },
          environmentSaveAnswer,
          {
            logged: "The environment.save call was refused:",
            message: "The snapshot could not be taken",
            instead: (reason) => new UnavailableError(reason),
          },
          SAVE_TIMEOUT_MS,
        )
        .then(
          () => states.set(threadId, { state: "idle", savedAt: now().toISOString() }),
          (error: unknown) =>
            states.set(threadId, {
              state: "idle",
              savedAt: before.savedAt,
              error: reasonOf(error),
            }),
        );
      return stateOf(threadId);
    },
  };
}
