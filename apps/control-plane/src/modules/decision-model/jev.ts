import { check, decide } from "@anvia/core/decision";
import { JevClient } from "@anvia/jev";
import { TypeSafeClient } from "@typesafe-ai/sdk";

import type { AddressingDecider, AddressingModel, DecisionConfig } from "./types";

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

const QUESTIONS = {
  toAgent: check({
    instructions:
      "The message was written in a shared thread where an AI agent and several people work together. Is the author asking the AI agent (also written @agent) to do something, answer something, or continue the work?",
  }),
  toPerson: check({
    instructions:
      "Is the author talking to another person in the thread, either a mentioned teammate or someone the author was already talking with in the recent messages, and waiting for that person rather than the AI agent?",
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
      return { toAgent: answers.toAgent.probability, toPerson: answers.toPerson.probability };
    } catch (error) {
      console.error("The decision model could not tell who a message is for:", error);
      return null;
    }
  };
}
