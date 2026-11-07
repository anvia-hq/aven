import type { BotProjectView, BotThreadDetail, BotThreadView } from "@aven/protocol/threads";
import type { ProcessEnded, RunThreadInfo } from "@aven/protocol/runtime-wire";
import type { ForkView } from "@aven/protocol/forks";
import type { RunEnding } from "../runs/types";
import type { createThreadMessages } from "./messages";

export type ThreadModelChoice = { providerId?: string; modelId?: string; reasoningEffort?: string };

export type BotActor = { userId: string; botId: string; via: "person" | "note" };

export type BotThreads = {
  projects(userId: string): Promise<BotProjectView[]>;
  list(
    userId: string,
    filter: { projectId?: string; archived?: boolean },
  ): Promise<BotThreadView[]>;
  get(userId: string, id: string): Promise<BotThreadDetail>;
  start(
    actor: BotActor,
    input: { projectId: string; prompt: string; title?: string } & ThreadModelChoice,
  ): Promise<BotThreadView>;
  continue(
    actor: BotActor,
    id: string,
    input: { prompt: string } & ThreadModelChoice,
  ): Promise<BotThreadView>;
  archive(actor: BotActor, id: string, archived: boolean): Promise<BotThreadView>;
  stop(actor: BotActor, id: string): Promise<BotThreadView>;
};

export type ThreadForks = {
  start(
    thread: RunThreadInfo,
    input: { task: string; context: string; title?: string },
  ): Promise<{ id: string; title: string }>;
  status(thread: RunThreadInfo, id: string): Promise<ForkView>;
  ended(
    fork: { id: string; organizationId: string; parentThreadId?: string | null },
    ending: RunEnding,
  ): Promise<void>;
};

export type ThreadMessages = ReturnType<typeof createThreadMessages>;

export type ProcessEnds = {
  ended(runtimeId: string, ended: ProcessEnded): Promise<void>;
};

export type PutAwayThread = (thread: { id: string; runtimeId: string }) => void;

export type ThreadPullRequest = {
  number: number;
  url: string;
  branch: string;
  title: string;
  state: "open" | "closed" | "merged";
};

export type Viewer = { organizationId: string; userId: string };
