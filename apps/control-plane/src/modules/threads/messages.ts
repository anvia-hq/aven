import { COMPACT_PROMPT } from "@aven/agents/compaction-agent";
import { timing } from "@aven/runtime-client/timing";

import { prepareAttachments } from "../../attachments";
import { ConflictError } from "../../errors";
import { githubUserTokenService } from "../github/user-tokens";
import { assertSeesImages, resolveModel } from "../providers/resolve-model";
import type { RunManager } from "../runs/service";
import { mcpService } from "../mcp/service";
import { threadCockpit } from "../cockpit/commands";
import { memoryService } from "../memory/service";
import { projectsService } from "../projects/service";
import { skillsService } from "../skills/service";
import { usersService } from "../users/service";
import { variablesService } from "../variables/service";
import type { RunIdentity } from "../workload-identity/grants";
import { keepSecretAnswers } from "./secret-answers";
import type { AnswerQuestionBody, CompactBody, SendMessageBody } from "./schema";
import { threadsService } from "./service";

// Who a run is, for the identity tokens it can mint (decision 0049).
async function runIdentity(
  thread: { id: string; organizationId: string; projectId: string },
  userId: string,
): Promise<RunIdentity | undefined> {
  const person = await usersService.get(userId);
  if (!person) return undefined;
  return {
    organizationId: thread.organizationId,
    projectId: thread.projectId,
    threadId: thread.id,
    userId,
    email: person.email,
  };
}

// What a run carries for its sender: their skills, their MCP servers for thread agents and their
// GitHub account.
async function senderExtras(userId: string) {
  const skills = await skillsService.forRun(userId);
  const mcp = await mcpService.forRun(userId, "threads");
  const github = await githubUserTokenService.forRun(userId);
  return { skills, mcp, github };
}

// What a run carries for its sender in this thread's project: the variables, who the run is,
// their memory and their cockpit to read.
// Also records the sender as the person the thread last ran as, just before the run starts.
async function threadExtras(
  organizationId: string,
  thread: { id: string; organizationId: string; projectId: string },
  userId: string,
  onPersonsWord = true,
) {
  const env = await variablesService.forRun({
    organizationId,
    projectId: thread.projectId,
    userId,
  });
  const identity = await runIdentity(thread, userId);
  const memory = await runMemory(thread, userId, onPersonsWord);
  await threadsService.markRunBy(thread.id, userId);
  // The sender's cockpit, which a thread's agent reads and never changes (decision 0109).
  const cockpit = threadCockpit(userId);
  return { env, identity, memory, cockpit };
}

// The sender's memory in the project, which the thread's agent reads, and keeps when the run is on
// the person's word: a run a bot's note began, such as a follow-up on what a thread wrote, only reads,
// so what a thread or a schedule's task wrote is never kept by itself (decision 0102).
async function runMemory(
  thread: { id: string; projectId: string },
  userId: string,
  writable: boolean,
) {
  const owner = { userId, projectId: thread.projectId };
  return {
    caller: { owner, actor: { source: "thread" as const, threadId: thread.id }, writable },
    index: { folders: await memoryService.folders(owner), writable },
  };
}

// A thread of a deleted project is kept, archived, but nobody drives it any more (decision 0094).
async function requireLiveProject(organizationId: string, projectId: string) {
  if (!(await projectsService.get(organizationId, projectId))) {
    throw new ConflictError("This thread's project was deleted");
  }
}

// What a user says to a thread's agent: a message, or the answer to its question. Either starts a
// run on the model the sender chose, or else their default provider (null falls back to the
// environment's shared one), with the sender's skills, acting as their GitHub account, and with the project's
// environment variables. The runs are given, so `threads` does not depend on how they are made.
export const createThreadMessages = (runs: RunManager) => {
  // A message that starts a run of its own: refused while one is going. `onPersonsWord` is false
  // for a message a bot sends after a note, whose run may not keep notes (decision 0102).
  async function start(
    organizationId: string,
    userId: string,
    threadId: string,
    { prompt, attachments: files = [], mentions = [], ...selection }: SendMessageBody,
    { onPersonsWord = true }: { onPersonsWord?: boolean } = {},
  ) {
    const thread = await threadsService.owned({ organizationId, userId }, threadId);
    // Off unless AVEN_TIMING is set: what stands between the person's message and the runner being
    // told to run (decision 0119).
    const clock = timing(`message ${threadId}`);
    clock.mark("thread");
    await requireLiveProject(organizationId, thread.projectId);
    // The agent is waiting on its question; a message would leave it unanswered in the history.
    if (thread.awaitingAnswer) throw new ConflictError("Answer the agent's question first");
    const attachments = prepareAttachments(files);
    const model = await resolveModel(userId, selection);
    if (attachments.some((file) => file.image)) await assertSeesImages(model);
    clock.mark("model");
    const sender = await senderExtras(userId);
    clock.mark("sender");
    const scoped = await threadExtras(organizationId, thread, userId, onPersonsWord);
    clock.mark("thread extras");
    await runs.start(thread, prompt, model, { attachments, mentions, ...sender, ...scoped });
    clock.mark("started");
    await threadsService.reopen(thread);
    clock.mark("reopened");
  }

  // A message to an agent that is working, for it to take at its next step (decision 0098). True
  // once the runner has it; false when the run ended first, as the agent was finishing, and the
  // message is then one of its own. Files are not taken: they are copied into the sandbox as a run
  // starts.
  async function steer(
    organizationId: string,
    userId: string,
    threadId: string,
    { prompt, steerId, attachments = [], mentions = [] }: SendMessageBody,
  ) {
    const thread = await threadsService.owned({ organizationId, userId }, threadId);
    await requireLiveProject(organizationId, thread.projectId);
    if (thread.awaitingAnswer) throw new ConflictError("Answer the agent's question first");
    if (attachments.length > 0) {
      throw new ConflictError("Files can be sent when the agent is not working");
    }
    if (prompt.length === 0) throw new ConflictError("Write a message to send to the agent");
    const message = { id: steerId ?? crypto.randomUUID(), prompt, mentions };
    const queued = (await runs.steer(thread, message)) === "queued";
    if (queued) await threadsService.reopen(thread);
    return queued;
  }

  return {
    start,

    // What a person says in a thread: to an agent that is working it is a steering message, and
    // otherwise it starts a run. Says which it was.
    async send(
      organizationId: string,
      userId: string,
      threadId: string,
      body: SendMessageBody,
      options: { onPersonsWord?: boolean } = {},
    ): Promise<{ steered: boolean }> {
      if (runs.isRunning(threadId) && (await steer(organizationId, userId, threadId, body))) {
        return { steered: true };
      }
      await start(organizationId, userId, threadId, body, options);
      return { steered: false };
    },

    // Summarizes the thread's history, as a run of its own that needs no sandbox and no tools
    // (decision 0097). The person's prompt is `/compact`, which the thread shows, and the agent's
    // reply says whether anything was summarized.
    async compact(
      organizationId: string,
      userId: string,
      threadId: string,
      selection: CompactBody = {},
    ) {
      const thread = await threadsService.owned({ organizationId, userId }, threadId);
      await requireLiveProject(organizationId, thread.projectId);
      if (thread.awaitingAnswer) throw new ConflictError("Answer the agent's question first");
      const model = await resolveModel(userId, selection);
      await runs.start(thread, COMPACT_PROMPT, model, { compact: true });
      await threadsService.reopen(thread);
    },

    async answer(
      organizationId: string,
      userId: string,
      threadId: string,
      { answers, secretScope, skipSecrets, ...selection }: AnswerQuestionBody,
    ) {
      const thread = await threadsService.owned({ organizationId, userId }, threadId);
      await requireLiveProject(organizationId, thread.projectId);
      const continuation = await threadsService.continuation(thread.id);
      if (!continuation) throw new ConflictError("The agent is not waiting for an answer");
      const model = await resolveModel(userId, selection);
      const sender = await senderExtras(userId);
      // A request for a secret is stored here and the agent told only that it was (decision 0047),
      // before the run's variables are read, so the run that resumes has it.
      const kept = await keepSecretAnswers({
        organizationId,
        userId,
        projectId: thread.projectId,
        continuation,
        answers,
        scope: secretScope,
        skip: skipSecrets,
      });
      const scoped = await threadExtras(organizationId, thread, userId);
      await runs.answer(thread, continuation, kept, model, { ...sender, ...scoped });
      await threadsService.reopen(thread);
    },
  };
};

export type ThreadMessages = ReturnType<typeof createThreadMessages>;
