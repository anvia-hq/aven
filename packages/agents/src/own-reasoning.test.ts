import { describe, expect, test } from "bun:test";
import type { AssistantContentPart, CompletionRequest, Message } from "@anvia/core";

import { ownedByAnthropic, ownedByResponsesApi, withOwnReasoning } from "./own-reasoning";
import { scriptedModel } from "./testing/scripted-model";

const reasoning = (id: string): AssistantContentPart => ({ type: "reasoning", id, text: "" });
const assistant = (...content: AssistantContentPart[]): Message => ({ role: "assistant", content });

// What the model was asked, after the wrapper.
async function seen(history: Message[], owns = ownedByResponsesApi) {
  let asked: Message[] = [];
  const model = withOwnReasoning(
    scriptedModel([
      (request: CompletionRequest) => {
        asked = request.chatHistory;
        return [{ type: "text", text: "ok" }];
      },
    ]),
    owns,
  );
  await model.completion({ chatHistory: history, documents: [], tools: [] });
  return asked;
}

describe("reasoning a provider takes back", () => {
  test("the Responses API keeps its own and drops Anthropic's, and a message left empty goes", async () => {
    const asked = await seen([
      assistant(reasoning("thinking_0"), { type: "text", text: "from claude" }),
      assistant(reasoning("thinking_0")),
      assistant(reasoning("rs_abc"), { type: "text", text: "from gpt" }),
    ]);
    expect(asked).toEqual([
      assistant({ type: "text", text: "from claude" }),
      assistant(reasoning("rs_abc"), { type: "text", text: "from gpt" }),
    ]);
  });

  test("Anthropic keeps its own and drops the Responses API's", async () => {
    const asked = await seen(
      [
        assistant(reasoning("rs_abc"), { type: "text", text: "a" }),
        assistant(reasoning("thinking_1")),
      ],
      ownedByAnthropic,
    );
    expect(asked).toEqual([
      assistant({ type: "text", text: "a" }),
      assistant(reasoning("thinking_1")),
    ]);
  });
});
