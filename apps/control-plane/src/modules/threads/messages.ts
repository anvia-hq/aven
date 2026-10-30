import { ConflictError } from "../../errors";
import { providersService } from "../providers/service";
import { runsService } from "../runs/service";
import type { AnswerQuestionBody, SendMessageBody } from "./schema";
import { threadsService } from "./service";

// What a user says to a thread's agent: a message, or the answer to its question. Either starts a
// run on the model the sender chose, or else their default provider (null falls back to the
// environment's shared one). Kept out of `service.ts`, which `runs` depends on.
export const threadMessages = {
  async send(
    organizationId: string,
    userId: string,
    threadId: string,
    { prompt, ...selection }: SendMessageBody,
  ) {
    const thread = await threadsService.require(organizationId, threadId);
    // The agent is waiting on its question; a message would leave it unanswered in the history.
    if (thread.awaitingAnswer) throw new ConflictError("Answer the agent's question first");
    const model = await providersService.resolveModel(userId, selection);
    await runsService.start(thread, prompt, model);
  },

  async answer(
    organizationId: string,
    userId: string,
    threadId: string,
    { answers, ...selection }: AnswerQuestionBody,
  ) {
    const thread = await threadsService.require(organizationId, threadId);
    const continuation = await threadsService.continuation(thread.id);
    if (!continuation) throw new ConflictError("The agent is not waiting for an answer");
    const model = await providersService.resolveModel(userId, selection);
    await runsService.answer(thread, continuation, answers, model);
  },
};
