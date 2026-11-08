import type { QuestionPrompt } from "@aven/protocol/types";

export function answerShown(prompt: Pick<QuestionPrompt, "choices">, value: string) {
  return prompt.choices?.find((choice) => choice.value === value)?.label ?? value;
}
