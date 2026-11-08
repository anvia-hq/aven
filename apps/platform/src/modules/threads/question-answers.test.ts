import { expect, test } from "bun:test";

import { answerShown } from "./question-answers";

const prompt = {
  choices: [
    { value: "custom", label: "Let me pick the actions" },
    { value: "none", label: "No prompt actions" },
  ],
};

test("a picked choice is shown by its label, a typed answer as typed", () => {
  expect(answerShown(prompt, "custom")).toBe("Let me pick the actions");
  expect(answerShown(prompt, "none")).toBe("No prompt actions");
  expect(answerShown(prompt, "Something else entirely")).toBe("Something else entirely");
  expect(answerShown({}, "none")).toBe("none");
});
