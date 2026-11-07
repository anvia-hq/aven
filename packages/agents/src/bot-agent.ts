import { Agent, type AgentMemoryOptions, type AnyTool } from "@anvia/core";
import type { BotPeer } from "@aven/protocol/runtime-wire";

import { compactionFor, resolveAgentModel, type ModelSource } from "./agent-model";
import { botInstructions } from "./bot-instruction";
import { type McpNote } from "./mcp";
import type { SkillListing } from "./skills";
import { createAskQuestionTool, type AskQuestion } from "./tools/ask-question";
import { createCreateBotTool, type CreateBot } from "./tools/create-bot";
import { createGoalTools, type GoalHost } from "./tools/goals";
import { createListBotsTool } from "./tools/list-bots";
import { createMcpServerTools, type McpServersHost } from "./tools/mcp-servers";
import { createProviderTools, type ProvidersHost } from "./tools/providers";
import { createThreadTools, type ThreadsHost } from "./tools/threads";
import { createCockpitTool, type CockpitHost } from "./tools/cockpit";
import { createMemoryTool, type MemoryHost } from "./tools/memory";
import type { CockpitAccess } from "@aven/protocol/cockpit";
import type { RunMemory } from "@aven/protocol/memory";
import { createScheduleTools, type ScheduleHost } from "./tools/schedules";
import { createSendMessageTool, type SendMessage } from "./tools/send-message";
import { createUpdateSelfTool, type UpdateSelf } from "./tools/update-self";

export const BOT_MAX_TURNS = 8;

export const BOT_COMPUTER_MAX_TURNS = 30;

type BotAgentOptions = ModelSource & {
  id: string;
  name: string;
  handle: string;
  instruction: string;
  send: SendMessage;
  memory: AgentMemoryOptions;
  compactAfterTokens?: number;
  computer?: readonly AnyTool[];
  createBot?: CreateBot;
  peers: readonly BotPeer[];
  goals?: GoalHost;
  schedules?: ScheduleHost;
  timezone?: string;
  description?: string;
  askQuestion?: AskQuestion;
  updateSelf?: UpdateSelf;
  skills?: readonly SkillListing[];
  mcp?: { tools: readonly AnyTool[]; note: McpNote };
  mcpServers?: McpServersHost;
  providers?: ProvidersHost;
  threads?: ThreadsHost;
  notes?: { memory: RunMemory; host: MemoryHost };
  cockpit?: { access: CockpitAccess; host: CockpitHost };
};

export function createBotAgent({
  id,
  name,
  handle,
  instruction,
  send,
  memory,
  compactAfterTokens,
  computer = [],
  createBot,
  peers,
  askQuestion,
  goals,
  schedules,
  timezone,
  description = "",
  updateSelf,
  skills,
  mcp,
  mcpServers,
  providers,
  threads,
  notes,
  cockpit,
  ...source
}: BotAgentOptions) {
  const agentModel = resolveAgentModel(source);
  const compaction = compactionFor(source, agentModel.model, compactAfterTokens);
  return new Agent({
    ...agentModel,
    id: `bot-${id}`,
    instructions: botInstructions({
      name,
      handle,
      instruction,
      computer: computer.length > 0,
      createBots: Boolean(createBot),
      questions: Boolean(askQuestion),
      goals: Boolean(goals),
      schedules: schedules && timezone ? { timezone } : undefined,
      peers,
      self: updateSelf ? { description } : undefined,
      skills,
      mcp: mcp?.note,
      mcpServers: Boolean(mcpServers),
      providers: providers ? { keyForm: Boolean(providers.askKey) } : undefined,
      threads: Boolean(threads),
      notes: notes?.memory,
    }),
    maxTurns: computer.length > 0 ? BOT_COMPUTER_MAX_TURNS : BOT_MAX_TURNS,
    memory: compaction ? { ...memory, compaction } : memory,
    tools: [
      createSendMessageTool(send),
      createListBotsTool(() => peers),
      ...computer,
      ...asking(askQuestion),
      ...working(goals),
      ...scheduling(schedules),
      ...makingBots(createBot),
      ...changingSelf(updateSelf),
      ...usingMcp(mcp),
      ...keepingMcpServers(mcpServers),
      ...keepingProviders(providers),
      ...workingThreads(threads),
      ...keepingNotes(notes?.host),
      ...workingCockpit(cockpit),
    ],
  });
}

const keepingNotes = (host?: MemoryHost) => (host ? [createMemoryTool(host)] : []);
const workingCockpit = (cockpit?: { access: CockpitAccess; host: CockpitHost }) =>
  cockpit ? [createCockpitTool(cockpit.host, cockpit.access)] : [];
const working = (goals?: GoalHost) => (goals ? createGoalTools(goals) : []);
const scheduling = (schedules?: ScheduleHost) => (schedules ? createScheduleTools(schedules) : []);
const asking = (askQuestion?: AskQuestion) =>
  askQuestion ? [createAskQuestionTool(askQuestion)] : [];
const makingBots = (createBot?: CreateBot) => (createBot ? [createCreateBotTool(createBot)] : []);
const changingSelf = (updateSelf?: UpdateSelf) =>
  updateSelf ? [createUpdateSelfTool(updateSelf)] : [];
const usingMcp = (mcp?: { tools: readonly AnyTool[] }) => (mcp ? mcp.tools : []);
const keepingMcpServers = (host?: McpServersHost) => (host ? createMcpServerTools(host) : []);
const keepingProviders = (host?: ProvidersHost) => (host ? createProviderTools(host) : []);
const workingThreads = (host?: ThreadsHost) => (host ? createThreadTools(host) : []);
