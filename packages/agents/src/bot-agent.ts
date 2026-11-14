import { Agent, type AgentMemoryOptions, type AnyTool } from "@anvia/core";

import { compactionFor, resolveAgentModel } from "./agent-model";
import { activityLabelOf, THINKING_LABEL } from "./bot-activity";
import { botInstructions } from "./bot-instruction";
import { forPaths, SANDBOX_PATHS } from "./sandbox-paths";
import { createApiTools } from "./tools/api";
import { createAskQuestionTool } from "./tools/ask-question";
import { createCreateBotTool } from "./tools/create-bot";
import { createDeleteBotTool } from "./tools/delete-bot";
import { createGoalTools } from "./tools/goals";
import { createListBotsTool } from "./tools/list-bots";
import { createMcpServerTools } from "./tools/mcp-servers";
import { createProviderTools } from "./tools/providers";
import { createReactToMessageTool } from "./tools/react-to-message";
import { createThreadTools } from "./tools/threads";
import { createCockpitTool } from "./tools/cockpit";
import { createMemoryTool } from "./tools/memory";
import { createScheduleTools } from "./tools/schedules";
import { createSendMessageTool } from "./tools/send-message";
import { createUpdateSelfTool } from "./tools/update-self";
import type { McpNote, ModelSource, SandboxPaths, SkillListing } from "./types";
import type {
  AskQuestion,
  CockpitHost,
  CreateBot,
  DeleteBot,
  GoalHost,
  McpServersHost,
  MemoryHost,
  ProvidersHost,
  ReactToMessage,
  ScheduleHost,
  SendMessage,
  ApiHost,
  ThreadsHost,
  UpdateSelf,
} from "./tools/types";
import type { BotPeer, CockpitAccess, RunMemory } from "@aven/protocol/types";

export const BOT_MAX_TURNS = 8;

export const BOT_COMPUTER_MAX_TURNS = 30;

type BotAgentOptions = ModelSource & {
  paths?: SandboxPaths;
  id: string;
  name: string;
  handle: string;
  instruction: string;
  send: SendMessage;
  react?: ReactToMessage;
  memory: AgentMemoryOptions;
  compactAfterTokens?: number;
  computer?: readonly AnyTool[];
  createBot?: CreateBot;
  deleteBot?: DeleteBot;
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
  api?: ApiHost;
  notes?: { memory: RunMemory; host: MemoryHost };
  cockpit?: { access: CockpitAccess; host: CockpitHost };
  onActivity?: (label: string | null) => void;
};

export function createBotAgent({
  id,
  name,
  handle,
  instruction,
  send,
  react,
  memory,
  compactAfterTokens,
  computer = [],
  createBot,
  deleteBot,
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
  api,
  notes,
  cockpit,
  paths,
  onActivity,
  ...source
}: BotAgentOptions) {
  const agentModel = resolveAgentModel(source);
  const compaction = compactionFor(source, agentModel.model, compactAfterTokens);
  return new Agent({
    ...agentModel,
    id: `bot-${id}`,
    instructions: forPaths(
      botInstructions({
        name,
        handle,
        instruction,
        computer: computer.length > 0,
        createBots: Boolean(createBot),
        deleteBots: Boolean(deleteBot),
        questions: Boolean(askQuestion),
        reactions: Boolean(react),
        goals: Boolean(goals),
        schedules: schedules && timezone ? { timezone } : undefined,
        peers,
        self: updateSelf ? { description } : undefined,
        skills,
        mcp: mcp?.note,
        mcpServers: Boolean(mcpServers),
        providers: providers ? { keyForm: Boolean(providers.askKey) } : undefined,
        threads: Boolean(threads),
        api: Boolean(api),
        notes: notes?.memory,
      }),
      paths ?? SANDBOX_PATHS,
    ),
    lifecycle: onActivity && {
      onStart: () => onActivity(THINKING_LABEL),
      onToolStart: ({ toolName, input }) => onActivity(activityLabelOf(toolName, input)),
      onToolFinish: () => onActivity(THINKING_LABEL),
      onFinish: () => onActivity(null),
      onError: () => onActivity(null),
    },
    maxTurns: computer.length > 0 ? BOT_COMPUTER_MAX_TURNS : BOT_MAX_TURNS,
    memory: compaction ? { ...memory, compaction } : memory,
    tools: [
      createSendMessageTool(send),
      createListBotsTool(() => peers),
      ...reacting(react),
      ...computer,
      ...asking(askQuestion),
      ...working(goals),
      ...scheduling(schedules),
      ...makingBots(createBot),
      ...deletingBots(deleteBot),
      ...changingSelf(updateSelf),
      ...usingMcp(mcp),
      ...keepingMcpServers(mcpServers),
      ...keepingProviders(providers),
      ...workingThreads(threads),
      ...usingApi(api),
      ...keepingNotes(notes?.host),
      ...workingCockpit(cockpit),
    ],
  });
}

const usingApi = (host?: ApiHost) => (host ? createApiTools(host) : []);
const reacting = (react?: ReactToMessage) => (react ? [createReactToMessageTool(react)] : []);
const keepingNotes = (host?: MemoryHost) => (host ? [createMemoryTool(host)] : []);
const workingCockpit = (cockpit?: { access: CockpitAccess; host: CockpitHost }) =>
  cockpit ? [createCockpitTool(cockpit.host, cockpit.access)] : [];
const working = (goals?: GoalHost) => (goals ? createGoalTools(goals) : []);
const scheduling = (schedules?: ScheduleHost) => (schedules ? createScheduleTools(schedules) : []);
const asking = (askQuestion?: AskQuestion) =>
  askQuestion ? [createAskQuestionTool(askQuestion)] : [];
const makingBots = (createBot?: CreateBot) => (createBot ? [createCreateBotTool(createBot)] : []);
const deletingBots = (deleteBot?: DeleteBot) => (deleteBot ? [createDeleteBotTool(deleteBot)] : []);
const changingSelf = (updateSelf?: UpdateSelf) =>
  updateSelf ? [createUpdateSelfTool(updateSelf)] : [];
const usingMcp = (mcp?: { tools: readonly AnyTool[] }) => (mcp ? mcp.tools : []);
const keepingMcpServers = (host?: McpServersHost) => (host ? createMcpServerTools(host) : []);
const keepingProviders = (host?: ProvidersHost) => (host ? createProviderTools(host) : []);
const workingThreads = (host?: ThreadsHost) => (host ? createThreadTools(host) : []);
