import { describe, expect, test } from "bun:test";
import type { AssistantContentPart, CompletionRequest, Message } from "@anvia/core";

import {
  ownedByAnthropic,
  ownedByResponsesApi,
  withAnthropicReasoning,
  withOwnReasoning,
} from "./own-reasoning";
import { scriptedModel } from "./testing/scripted-model";

const reasoning = (id: string): AssistantContentPart => ({ type: "reasoning", id, text: "" });
const assistant = (...content: AssistantContentPart[]): Message => ({ role: "assistant", content });

type Model = ReturnType<typeof scriptedModel>;

// What the model was asked, after the wrapper.
async function seen(
  history: Message[],
  wrap: (model: Model) => Model = (model) => withOwnReasoning(model, ownedByResponsesApi),
) {
  let asked: Message[] = [];
  const model = wrap(
    scriptedModel([
      (request: CompletionRequest) => {
        asked = request.chatHistory;
        return [{ type: "text", text: "ok" }];
      },
    ]),
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
      (model) => withOwnReasoning(model, ownedByAnthropic),
    );
    expect(asked).toEqual([
      assistant({ type: "text", text: "a" }),
      assistant(reasoning("thinking_1")),
    ]);
  });

  // Anthropic refuses an earlier turn's thinking once what preceded it changed (bug 0001), while
  // the turn in progress needs its own back to continue from its tool calls.
  test("Anthropic gets its thinking back from the turn in progress only", async () => {
    const asked = await seen(
      [
        { role: "user", content: "Edit a.txt" },
        assistant(reasoning("thinking_0"), { type: "text", text: "Done." }),
        assistant(reasoning("thinking_1")),
        { role: "user", content: "Again" },
        assistant(reasoning("thinking_2"), reasoning("rs_abc"), { type: "text", text: "On it." }),
      ],
      withAnthropicReasoning,
    );
    expect(asked).toEqual([
      { role: "user", content: "Edit a.txt" },
      assistant({ type: "text", text: "Done." }),
      { role: "user", content: "Again" },
      assistant(reasoning("thinking_2"), { type: "text", text: "On it." }),
    ]);
  });
});
