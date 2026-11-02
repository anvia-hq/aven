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
import { createScheduleTools, type ScheduleHost } from "./tools/schedules";
import { createSendMessageTool, type SendMessage } from "./tools/send-message";
import { createUpdateSelfTool, type UpdateSelf } from "./tools/update-self";

// A bot answers with a few messages, so a handful of turns is plenty.
export const BOT_MAX_TURNS = 8;

// A bot with a computer also works on it between its messages.
export const BOT_COMPUTER_MAX_TURNS = 30;

type BotAgentOptions = ModelSource & {
  /** The bot's id: its conversation is kept under it. */
  id: string;
  name: string;
  /** How other bots write to this one (decision 0065). */
  handle: string;
  instruction: string;
  /** Sends a message the bot wrote, to the person or to another bot. */
  send: SendMessage;
  /** Where the conversation is kept. */
  memory: AgentMemoryOptions;
  /** The size of the conversation, in tokens, past which it is summarized; by default 70% of the model's window. */
  compactAfterTokens?: number;
  /** What the bot can do on its computer, supplied by the host that runs it (decision 0059). Without any, it only talks. */
  computer?: readonly AnyTool[];
  /** Makes another bot, for the person's main bot only (decision 0060); without it the bot cannot. */
  createBot?: CreateBot;
  /**
   * The person's other bots, which the instructions list and `list_bots` gives. The host owns the
   * array and adds a bot it makes to it, so the list is current through the reply (decision 0065).
   */
  peers: readonly BotPeer[];
  /** The bot's goal, which it may work on in the background and, on the person's word, start or stop (decision 0068). */
  goals?: GoalHost;
  /** The person's schedules, which the bot may look at and, on their word, change (decision 0067). */
  schedules?: ScheduleHost;
  /** The person's timezone, which the bot's schedules are in unless it says another. */
  timezone?: string;
  /** What the bot's description is now. */
  description?: string;
  /** Asks the person to decide (decision 0066); without it the bot cannot, as when nobody is there to answer. */
  askQuestion?: AskQuestion;
  /** Changes this bot's own name, description or instruction (decision 0061); without it the bot cannot. */
  updateSelf?: UpdateSelf;
  /** The skills the host put in the computer's `/skills`, which the bot reads there (decision 0081). */
  skills?: readonly SkillListing[];
  /** The person's MCP servers' tools, which the reply connected, and what the bot is told of them (decision 0085). */
  mcp?: { tools: readonly AnyTool[]; note: McpNote };
  /** Keeps the person's MCP servers (decision 0085); without it the bot can use them but not change them. */
  mcpServers?: McpServersHost;
  /** Keeps the person's model providers (decision 0086); without it the bot cannot. A key is never in it. */
  providers?: ProvidersHost;
};

// A bot is an agent that talks by sending messages (decision 0058), and works on its computer when
// the host gives it one (decision 0059). It runs through
// `generate`, with no stream, since nothing is shown until it sends something. It keeps its own
// conversation, and summarizes it past a size so the chat can go on.
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
    ],
  });
}

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
