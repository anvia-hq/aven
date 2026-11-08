import type { ModelSelection } from "../providers/types";
import type { ActionRunResult, ThreadAction } from "@aven/protocol/types";

export type ThreadActionBody = ThreadAction & { body: string };

export type ParsedActions = { actions: ThreadActionBody[]; problem: string | null };

export type ActionsDeps = {
  send: (
    organizationId: string,
    userId: string,
    threadId: string,
    body: { prompt: string } & ModelSelection,
  ) => Promise<void>;
};

export type StartActionInput = ModelSelection & { name: string };

export type ActionStarted =
  | { kind: "run"; process: ActionRunResult["process"] }
  | { kind: "prompt" };
