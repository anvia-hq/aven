import { COMPACT_PROMPT } from "@aven/agents/compaction-agent";
import { timing } from "@aven/runtime-client/timing";

import { driverPrompt, isDriving, ownPrompt } from "@aven/protocol/drivers";
import { backendRefusal, backendSupports } from "@aven/protocol/runtime-wire";
import { prepareAttachments } from "../../attachments";
import { ConflictError, UnprocessableError } from "../../errors";
import { claudeSetupService } from "../claude-setup/service";
import { githubService } from "../github/service";
import { githubUserTokenService } from "../github/user-tokens";
import { assertSeesImages, resolveModel } from "../providers/resolve-model";
import type { RunManager } from "../runs/service";
import { webSearchForRun } from "../runs/web-search";
import { mcpService } from "../mcp/service";
import { threadCockpit } from "../cockpit/commands";
import { memoryService } from "../memory/service";
import { projectsService } from "../projects/service";
import { skillsService } from "../skills/service";
import { usersService } from "../users/service";
import { variablesService } from "../variables/service";
import { decisionModelService } from "../decision-model/service";
import { addressingDecider, jevModel } from "../decision-model/jev";
import { threadMentionsService } from "./mentions";
import { createAddressingGate, recentOf, recentSenders } from "./addressing-gate";
import { asksForSecret, keepSecretAnswers } from "./secret-answers";
import type { AnswerQuestionBody, CompactBody, SendMessageBody } from "./schema";
import { threadsService } from "./service";
import type { RunIdentity } from "../workload-identity/types";
import type { Acting, AddressingGate } from "./types";

const defaultGate = createAddressingGate({
  configOf: (organizationId) => decisionModelService.config(organizationId),
  deciderFor: (config) => addressingDecider(jevModel(config)),
});

async function runIdentity(
  thread: { id: string; organizationId: string; projectId: string },
  userId: string,
  driverId?: string,
): Promise<RunIdentity | undefined> {
  const person = await usersService.get(userId);

  if (!person) return undefined;

  const identity: RunIdentity = {
    organizationId: thread.organizationId,
    projectId: thread.projectId,
    threadId: thread.id,
    userId,
    email: person.email,
  };

  if (driverId !== undefined) identity.driverId = driverId;

  return identity;
}

async function senderExtras(userId: string, installationRowId: string | null, driverId?: string) {
  const skills = await skillsService.forRun(userId);
  const mcp = driverId === undefined ? await mcpService.forRun(userId, "threads") : [];
  const github = installationRowId
    ? await githubUserTokenService.forRun(
        driverId ?? userId,
        await githubService.appKeyOf(installationRowId),
      )
    : undefined;
  return { skills, mcp, github };
}

async function threadExtras(
  organizationId: string,
  thread: { id: string; organizationId: string; projectId: string },
  userId: string,
  onPersonsWord = true,
  driverId?: string,
) {
  const env = await variablesService.forRun({
    organizationId,
    projectId: thread.projectId,
    userId,
    withoutPersonal: driverId !== undefined,
  });
  const identity = await runIdentity(thread, userId, driverId);
  const memory = await runMemory(thread, userId, onPersonsWord && driverId === undefined);
  await threadsService.markRunBy(thread.id, userId);
  const cockpit = threadCockpit(userId);
  return { env, identity, memory, cockpit, webSearch: webSearchForRun };
}

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

async function requireLiveProject(organizationId: string, projectId: string) {
  const project = await projectsService.get(organizationId, projectId);

  if (!project) throw new ConflictError("This thread's project was deleted");

  return project;
}

export async function acting(organizationId: string, userId: string, threadId: string) {
  const thread = await threadsService.drivable({ organizationId, userId }, threadId);

  if (thread.createdBy === userId) {
    return { thread, ownerId: userId, driverId: undefined, said: ownPrompt };
  }

  const person = await usersService.get(userId);
  const said = (text: string) => driverPrompt(person?.name ?? "", text);
  return { thread, ownerId: thread.createdBy, driverId: userId, said };
}

export const createThreadMessages = (runs: RunManager, gate: AddressingGate = defaultGate) => {
  async function keptFromAgent(
    organizationId: string,
    userId: string,
    who: Acting,
    { prompt, attachments = [] }: SendMessageBody,
  ) {
    const { thread, said } = who;

    if (runs.isRunning(thread.id)) return false;

    if (attachments.length > 0) return false;

    if (!isDriving(thread.drivingUntil)) return false;

    const author = (await usersService.get(userId))?.name ?? "";
    const owner =
      thread.createdBy === userId
        ? author
        : ((await usersService.get(thread.createdBy))?.name ?? "");
    const { messages } = await runs.latest(thread);
    const names = new Map<string, string>();
    for (const id of recentSenders(messages)) {
      const name = (await usersService.get(id))?.name;

      if (name) names.set(id, name);
    }
    const verdict = await gate({
      organizationId,
      prompt,
      author,
      owner,
      recent: recentOf(messages, names),
    });

    if (verdict.agentAction) return false;

    await runs.note(thread, said(prompt), userId);
    return true;
  }

  async function start(
    organizationId: string,
    userId: string,
    threadId: string,
    { prompt, attachments: files = [], mentions = [], ...selection }: SendMessageBody,
    { onPersonsWord = true, known }: { onPersonsWord?: boolean; known?: Acting } = {},
  ) {
    const { thread, ownerId, driverId, said } =
      known ?? (await acting(organizationId, userId, threadId));
    const clock = timing(`message ${threadId}`);
    clock.mark("thread");
    const project = await requireLiveProject(organizationId, thread.projectId);

    if (thread.awaitingAnswer) throw new ConflictError("Answer the agent's question first");

    const attachments = prepareAttachments(files);
    const claude = thread.agentBackend === "claude";
    const model = claude ? undefined : await resolveModel(driverId ?? ownerId, selection);

    if (!claude && model && attachments.some((file) => file.image)) await assertSeesImages(model);

    const claudeToken = claude ? await claudeSetupService.requireFor(thread.createdBy) : undefined;
    const claudeModel = claude ? selection.modelId : undefined;
    clock.mark("model");
    const sender = await senderExtras(ownerId, project.githubInstallationId, driverId);
    clock.mark("sender");
    const scoped = await threadExtras(organizationId, thread, ownerId, onPersonsWord, driverId);
    clock.mark("thread extras");
    await runs.start(thread, said(prompt), model, {
      attachments,
      mentions,
      senderId: userId,
      claudeToken,
      claudeModel,
      ...sender,
      ...scoped,
    });
    clock.mark("started");
    await threadsService.reopen(thread);
    clock.mark("reopened");
  }

  async function steer(
    organizationId: string,
    userId: string,
    threadId: string,
    { prompt, steerId, attachments = [], mentions = [] }: SendMessageBody,
    known?: Acting,
  ) {
    const { thread, said } = known ?? (await acting(organizationId, userId, threadId));
    await requireLiveProject(organizationId, thread.projectId);

    if (thread.awaitingAnswer) throw new ConflictError("Answer the agent's question first");

    if (attachments.length > 0) {
      throw new ConflictError("Files can be sent when the agent is not working");
    }

    if (prompt.length === 0) throw new ConflictError("Write a message to send to the agent");

    if (!backendSupports(thread.agentBackend, "steering")) {
      throw new ConflictError(backendRefusal(thread.agentBackend, "steering"));
    }

    const message = {
      id: steerId ?? crypto.randomUUID(),
      prompt: said(prompt),
      mentions,
      senderId: userId,
    };
    const queued = (await runs.steer(thread, message)) === "queued";

    if (queued) await threadsService.reopen(thread);

    return queued;
  }

  return {
    start,

    async send(
      organizationId: string,
      userId: string,
      threadId: string,
      body: SendMessageBody,
      options: { onPersonsWord?: boolean } = {},
    ): Promise<{ steered: boolean; agentAction?: false }> {
      const known = await acting(organizationId, userId, threadId);
      const delivered = async (): Promise<{ steered: boolean; agentAction?: false }> => {
        if (await keptFromAgent(organizationId, userId, known, body)) {
          return { steered: false, agentAction: false };
        }

        if (
          runs.isRunning(threadId) &&
          (await steer(organizationId, userId, threadId, body, known))
        ) {
          return { steered: true };
        }

        await start(organizationId, userId, threadId, body, { ...options, known });
        return { steered: false };
      };
      const result = await delivered();
      await threadMentionsService
        .record(threadId, userId, body.prompt)
        .catch((error) => console.error(`mention not recorded for ${threadId}`, error));
      return result;
    },

    async compact(
      organizationId: string,
      userId: string,
      threadId: string,
      selection: CompactBody = {},
    ) {
      const thread = await threadsService.owned({ organizationId, userId }, threadId);
      await requireLiveProject(organizationId, thread.projectId);

      if (thread.awaitingAnswer) throw new ConflictError("Answer the agent's question first");

      if (!backendSupports(thread.agentBackend, "compaction")) {
        throw new UnprocessableError(backendRefusal(thread.agentBackend, "compaction"));
      }

      const claude = thread.agentBackend === "claude";
      const model = claude ? undefined : await resolveModel(userId, selection);
      const claudeToken = claude
        ? await claudeSetupService.requireFor(thread.createdBy)
        : undefined;
      await runs.start(thread, COMPACT_PROMPT, model, {
        compact: true,
        claudeToken,
        claudeModel: claude ? selection.modelId : undefined,
      });
      await threadsService.reopen(thread);
    },

    async answer(
      organizationId: string,
      userId: string,
      threadId: string,
      { answers, secretScope, skipSecrets, ...selection }: AnswerQuestionBody,
    ) {
      const { thread, ownerId, driverId } = await acting(organizationId, userId, threadId);
      const project = await requireLiveProject(organizationId, thread.projectId);
      const continuation = await threadsService.continuation(thread.id);

      if (!continuation) throw new ConflictError("The agent is not waiting for an answer");

      if (driverId !== undefined && asksForSecret(continuation)) {
        throw new ConflictError("Only the thread's creator can answer a request for a secret");
      }

      const claude = thread.agentBackend === "claude";
      const model = claude ? undefined : await resolveModel(driverId ?? ownerId, selection);
      const claudeToken = claude
        ? await claudeSetupService.requireFor(thread.createdBy)
        : undefined;
      const sender = await senderExtras(ownerId, project.githubInstallationId, driverId);
      const kept = await keepSecretAnswers({
        organizationId,
        userId: ownerId,
        projectId: thread.projectId,
        continuation,
        answers,
        scope: secretScope,
        skip: skipSecrets,
      });
      const scoped = await threadExtras(organizationId, thread, ownerId, true, driverId);
      await runs.answer(thread, continuation, kept, model, {
        ...sender,
        ...scoped,
        claudeToken,
        claudeModel: claude ? selection.modelId : undefined,
      });
      await threadsService.reopen(thread);
    },
  };
};
