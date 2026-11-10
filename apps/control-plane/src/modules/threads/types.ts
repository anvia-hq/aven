import type { RunEnding } from "../runs/types";
import type { createThreadContinuation } from "./continuation";
import type { acting, createThreadMessages } from "./messages";
import type { SendMessageBody } from "./schema";
import type {
  BotProjectView,
  BotThreadDetail,
  BotThreadView,
  ForkView,
  ProcessEnded,
  RunThreadInfo,
} from "@aven/protocol/types";

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

export type ThreadPerson = { id: string; name: string; image: string | null };

export type Viewer = { organizationId: string; userId: string };

export type ModelSelection = Pick<SendMessageBody, "providerId" | "modelId" | "reasoningEffort">;

export type PatchOf = (
  organizationId: string,
  threadId: string,
) => Promise<{ patch: string; truncated: boolean } | null>;

export type ThreadContinuation = ReturnType<typeof createThreadContinuation>;

export type PersonMention = { id: string; name: string };

export type AddressingScores = { toPerson: number };

export type Addressing = { agentAction: boolean; by: "model" | "fallback" };

export type GateRequest = {
  organizationId: string;
  prompt: string;
  author: string;
  owner: string;
  recent: { author: string; text: string }[];
};

export type AddressingGate = (request: GateRequest) => Promise<Addressing>;

export type Acting = Awaited<ReturnType<typeof acting>>;
