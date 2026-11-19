import { assertAgentInteractionResponse } from "@anvia/core/agent/interactions";
import { expect, test } from "bun:test";

import { DECLINED, declinedAnswer } from "./declined-question";

const asked = () => ({
  version: 1,
  agentId: "agent",
  sourceRunId: "run",
  state: {},
  interaction: {
    id: "i1",
    type: "tool-question",
    toolName: "ask_user",
    toolCallId: "c1",
    internalCallId: "ic1",
    questions: [
      {
        id: "pr",
        text: "Ready or draft?",
        choices: [
          { label: "Ready", value: "ready" },
          { label: "Draft", value: "draft" },
        ],
      },
    ],
  },
});

test("a question that takes only its choices is opened to the declined answer", () => {
  const { continuation, answers } = declinedAnswer(asked());

  expect(answers).toEqual([{ questionId: "pr", value: DECLINED }]);
  expect(() =>
    assertAgentInteractionResponse(continuation.interaction, { type: "tool-question", answers }),
  ).not.toThrow();
  expect(() =>
    assertAgentInteractionResponse(asked().interaction as never, {
      type: "tool-question",
      answers,
    }),
  ).toThrow();
});

test("every question of the turn is declined", () => {
  const two = asked();
  two.interaction.questions.push({ id: "base", text: "Which base?" } as never);

  expect(declinedAnswer(two).answers.map((answer) => answer.questionId)).toEqual(["pr", "base"]);
});

test("a question that is not waiting on an answer cannot be declined", () => {
  expect(() => declinedAnswer({ nonsense: true })).toThrow();
});
