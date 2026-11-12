import { choice, decide } from "@anvia/core/decision";
import { JevClient } from "@anvia/jev";
import { TypeSafeClient } from "@typesafe-ai/sdk";

import type { AddressingDecider, AddressingModel, DecisionConfig, FollowUpDecider } from "./types";

export const OPENROUTER_BASE = "https://openrouter.ai/api";
export const DECISION_TIMEOUT_MS = 3000;
export const DEFAULT_MODEL: Record<DecisionConfig["kind"], string> = {
  jev: "jev-latest",
  "jev-openrouter": "typesafe/jev-1.13",
};

const bufferedFetch = async (url: string | URL | Request, init?: RequestInit) => {
  const res = await fetch(url, init);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return new Response(body, { status: res.status, headers: res.headers });
};

export function jevModel({ kind, modelId, apiKey }: DecisionConfig): AddressingModel {
  const options: ConstructorParameters<typeof TypeSafeClient>[0] = {
    apiKey,
    retry: { maxRetries: 0 },
    logLevel: "off",
    fetch: bufferedFetch as typeof fetch,
  };

  if (kind === "jev-openrouter") options.baseURL = OPENROUTER_BASE;

  const sdk = new TypeSafeClient(options);
  return new JevClient({ client: sdk }).decisionModel({ modelId });
}

const FOLLOW_UP_QUESTIONS = {
  nextStep: choice({
    instructions:
      "Read the end of a conversation between a person and an AI coding agent. Decide whether the person is likely to answer the agent's last message with one of a few predictable replies, so that suggested reply buttons would save them typing.",
    options: {
      suggest:
        "The agent proposed a plan, offered options, asked what to do next, asked for a decision, or finished work the person would verify, continue or refine.",
      skip: "The agent answered a plain question, confirmed something, gave a status, or the conversation has reached a natural end, so nothing predictable follows.",
    },
  }),
};

const QUESTIONS = {
  addressee: choice({
    instructions:
      "In a shared chat thread, several people and one AI coding agent talk in the same stream. Decide who the author of the last message is talking to. A message with no name in it usually continues the talk the author was just having in the recent messages. A first name, a term of address (bro, mas, bang, pak, you), a greeting or a reply to someone's question points to a person. A request for code work or a command (run, fix, check, build) points to the agent. A question about the project can still be for a person.",
    options: {
      agent:
        "The author wants the AI agent to do work, answer, or continue. Nobody else is being talked to.",
      person:
        "The author is talking to a teammate, named in the message or the one they were just talking to, and wants that person to reply.",
    },
  }),
};

export function addressingDecider(
  model: AddressingModel,
  timeoutMs = DECISION_TIMEOUT_MS,
): AddressingDecider {
  return async (input) => {
    try {
      const { answers } = await decide({
        model,
        state: input,
        questions: QUESTIONS,
        abortSignal: AbortSignal.timeout(timeoutMs),
        retries: false,
      });
      return { toPerson: answers.addressee.probabilities?.person ?? 0 };
    } catch (error) {
      console.error("The decision model could not tell who a message is for:", error);
      return null;
    }
  };
}

export function followUpDecider(
  model: AddressingModel,
  timeoutMs = DECISION_TIMEOUT_MS,
): FollowUpDecider {
  return async ({ transcript }) => {
    try {
      const { answers } = await decide({
        model,
        state: { transcript },
        questions: FOLLOW_UP_QUESTIONS,
        abortSignal: AbortSignal.timeout(timeoutMs),
        retries: false,
      });
      return answers.nextStep.probabilities?.suggest ?? null;
    } catch (error) {
      console.error("The decision model could not tell whether to suggest replies:", error);
      return null;
    }
  };
}
