import type { createBotChats } from "./chats";
import type { UpdateBotBody } from "./schema";
import type { AgentMemoryOptions } from "@anvia/core";
import type { createBotAgent } from "@aven/agents/bot-agent";
import type { GoalInput } from "../goals/types";
import type { MemoryCaller, MemoryOwner } from "../memory/types";
import type { ScheduleInput, SchedulePatch } from "../schedules/types";
import type { ModelConfig } from "@aven/agents/types";
import type { AskQuestion, SendMessage } from "@aven/agents/tools/types";
import type {
  Bot,
  BotCreateParams,
  BotGoalView,
  BotQuestion,
  BotScheduleView,
  BotSent,
  GoalAction,
  MemoryCommand,
  MemoryFolder,
  RunAttachment,
  RunSkill,
} from "@aven/protocol/types";

export type BotLetter = {
  userId: string;
  from: Bot;
  hops: number;
  handle: string;
  text: string;
  relaysPersonsWord: boolean;
};

export type BotChats = ReturnType<typeof createBotChats>;

export type BotKeeper = {
  list(userId: string): Promise<Bot[]>;
  create(userId: string, bot: NewBot): Promise<Bot>;
  update(userId: string, id: string, changes: UpdateBotBody): Promise<Bot | null>;
  deliver(letter: BotLetter): Promise<BotSent>;
  timezone(userId: string): Promise<string>;
  schedules: {
    list(userId: string): Promise<BotScheduleView[]>;
    create(userId: string, selfId: string, input: ScheduleInput): Promise<BotScheduleView>;
    update(userId: string, id: string, patch: SchedulePatch): Promise<BotScheduleView>;
    remove(userId: string, id: string): Promise<void>;
  };
  goals: {
    get(botId: string): Promise<BotGoalView | null>;
    start(userId: string, botId: string, input: GoalInput): Promise<BotGoalView>;
    update(botId: string, action: GoalAction, reason?: string): Promise<BotGoalView | null>;
  };
  greet(userId: string, botId: string, hops: number): Promise<void>;
};

export type BotMemoryNotes = {
  folders(owner: MemoryOwner): Promise<MemoryFolder[]>;
  run(caller: MemoryCaller, command: MemoryCommand): Promise<string>;
};

export type BotSkills = {
  forRun(userId: string): Promise<RunSkill[]>;
  archive(digest: string): Promise<Uint8Array | undefined>;
};

export type BotReplyInput = {
  bot: Bot;
  userId: string;
  model: ModelConfig;
  prompt: string;
  attachments?: RunAttachment[];
  onPersonsWord: boolean;
  hops: number;
  aboutThread?: string;
  say(text: string): void;
  ask(questions: BotQuestion[]): void;
  signal: AbortSignal;
};

export type BotReplier = {
  ready(model: ModelConfig): void;
  answer(input: BotReplyInput): Promise<void>;
};

export type BotSettled = (reply: {
  userId: string;
  botId: string;
  prompt: string;
  ok: boolean;
}) => Promise<void>;

export type BotDelivery = {
  bot: Bot;
  userId: string;
  from: Pick<Bot, "id" | "name" | "handle">;
  text: string;
  hops: number;
  relaysPersonsWord: boolean;
  model: ModelConfig;
};

export type NewBot = Omit<BotCreateParams, "replyId">;

export type BotAgent = Pick<ReturnType<typeof createBotAgent>, "generate">;

export type CreateBotAgent = (input: {
  bot: Bot;
  model: ModelConfig;
  send: SendMessage;
  askQuestion: AskQuestion;
  memory: AgentMemoryOptions;
}) => BotAgent;
