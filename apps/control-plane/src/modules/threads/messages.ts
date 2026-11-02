import { prepareAttachments } from "../../attachments";
import { ConflictError } from "../../errors";
import { githubUserTokenService } from "../github/user-tokens";
import { assertSeesImages, resolveModel } from "../providers/resolve-model";
import type { RunManager } from "../runs/service";
import { skillsService } from "../skills/service";
import { usersService } from "../users/service";
import { variablesService } from "../variables/service";
import type { RunIdentity } from "../workload-identity/grants";
import { keepSecretAnswers } from "./secret-answers";
import type { AnswerQuestionBody, SendMessageBody } from "./schema";
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

// What a run carries for its sender: their skills and their GitHub account.
async function senderExtras(userId: string) {
  const skills = await skillsService.forRun(userId);
  const github = await githubUserTokenService.forRun(userId);
  return { skills, github };
}

// What a run carries for its sender in this thread's project: the variables and who the run is.
// Also records the sender as the person the thread last ran as, just before the run starts.
async function threadExtras(
  organizationId: string,
  thread: { id: string; organizationId: string; projectId: string },
  userId: string,
) {
  const env = await variablesService.forRun({
    organizationId,
    projectId: thread.projectId,
    userId,
  });
  const identity = await runIdentity(thread, userId);
  await threadsService.markRunBy(thread.id, userId);
  return { env, identity };
}

// What a user says to a thread's agent: a message, or the answer to its question. Either starts a
// run on the model the sender chose, or else their default provider (null falls back to the
// environment's shared one), with the sender's skills, acting as their GitHub account, and with the project's
// environment variables. The runs are given, so `threads` does not depend on how they are made.
export const createThreadMessages = (runs: RunManager) => ({
  async send(
    organizationId: string,
    userId: string,
    threadId: string,
    { prompt, attachments: files = [], mentions = [], ...selection }: SendMessageBody,
  ) {
    const thread = await threadsService.require(organizationId, threadId);
    // The agent is waiting on its question; a message would leave it unanswered in the history.
    if (thread.awaitingAnswer) throw new ConflictError("Answer the agent's question first");
    const attachments = prepareAttachments(files);
    const model = await resolveModel(userId, selection);
    if (attachments.some((file) => file.image)) await assertSeesImages(model);
    const sender = await senderExtras(userId);
    const scoped = await threadExtras(organizationId, thread, userId);
    await runs.start(thread, prompt, model, { attachments, mentions, ...sender, ...scoped });
  },

  async answer(
    organizationId: string,
    userId: string,
    threadId: string,
    { answers, secretScope, skipSecrets, ...selection }: AnswerQuestionBody,
  ) {
    const thread = await threadsService.require(organizationId, threadId);
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
  },
});

export type ThreadMessages = ReturnType<typeof createThreadMessages>;
