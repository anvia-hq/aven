import { extract } from "@anvia/core/extractor";
import { resolveAgentModel } from "@aven/agents/agent-model";
import type { ModelConfig } from "@aven/agents/types";
import { THREAD_TITLE_MAX } from "@aven/protocol/threads";
import type { ChatMessage } from "@aven/protocol/types";
import { UnprocessableError } from "@aven/server-kit/errors";
import { z } from "zod";

import { resolveModel } from "../providers/resolve-model";
import { serverModelsService } from "../server-models/service";
import type { ThreadExchange } from "./types";

const TITLE_TIMEOUT_MS = 15_000;
const USER_CHARS = 1500;
const ASSISTANT_CHARS = 2500;

const INSTRUCTIONS = `You name a conversation between a person and an AI software engineer.
Given the person's latest message and the engineer's reply, write a title that says what the conversation is about.
- 2 to 6 words, in the language the person wrote in.
- Name the task or the subject, for example "Fix flaky upload test" or "Rebase onto main".
- No quotes, no trailing punctuation, no prefix like "Title:".
- Use only what the messages say.`;

const schema = z.object({ title: z.string().trim().min(1).max(THREAD_TITLE_MAX) });

const textOf = (message: ChatMessage) =>
  message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .trim();

export function exchangeOf(messages: readonly ChatMessage[]): ThreadExchange | null {
  const asked = messages.findLastIndex((message) => message.role === "user" && textOf(message));

  if (asked === -1) return null;

  const answer = messages
    .slice(asked + 1)
    .findLast((message) => message.role === "assistant" && textOf(message));
  return {
    user: textOf(messages[asked]!).slice(0, USER_CHARS),
    assistant: answer ? textOf(answer).slice(0, ASSISTANT_CHARS) : "",
  };
}

const unquote = (text: string) => text.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "").trim();

export function cleanTitle(raw: string) {
  return unquote(unquote(raw.trim()).replace(/^title:\s*/i, ""))
    .replace(/[.。]+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, THREAD_TITLE_MAX);
}

type ModelSources = {
  small: () => Promise<ModelConfig | null>;
  own: (userId: string) => Promise<ModelConfig | null>;
};

export async function titleModel(
  userId: string,
  { small, own }: ModelSources = {
    small: () => serverModelsService.small(),
    own: (id) => resolveModel(id),
  },
) {
  return (await small()) ?? (await own(userId));
}

export function createThreadTitler(
  resolveConfig: (userId: string) => Promise<ModelConfig | null> = titleModel,
) {
  return {
    async suggest(exchange: ThreadExchange, userId: string, signal?: AbortSignal) {
      const config = await resolveConfig(userId);

      if (!config) {
        throw new UnprocessableError(
          "Add a provider or set a small model in settings, so a title can be generated",
        );
      }

      const timeout = AbortSignal.timeout(TITLE_TIMEOUT_MS);
      const title = await Promise.resolve()
        .then(() =>
          extract({
            model: resolveAgentModel(config).model,
            text: [
              `Person: ${exchange.user}`,
              exchange.assistant ? `Engineer: ${exchange.assistant}` : "Engineer: (no reply yet)",
            ].join("\n\n"),
            instructions: INSTRUCTIONS,
            outputSchema: schema,
            retries: false,
            abortSignal: signal ? AbortSignal.any([signal, timeout]) : timeout,
          }),
        )
        .then(
          ({ output }) => cleanTitle(output.title),
          () => "",
        );

      if (!title) {
        throw new UnprocessableError("The title could not be generated. Try again in a moment");
      }

      return title;
    },
  };
}

export const threadTitler = createThreadTitler();
