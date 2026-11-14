import { questionAnswers, SECRET_TOOL_NAME } from "@aven/protocol/events";
import type { ToolPart } from "@aven/protocol/types";

import { answerShown } from "../question-answers";

function headline(tool: ToolPart, count: number) {
  if (tool.name === SECRET_TOOL_NAME) {
    return "A secret was asked for; you answered privately";
  }

  return `You answered ${count === 1 ? "a question" : `${count} questions`}`;
}

export function QuestionBlock({ tool }: { tool: ToolPart }) {
  const answers = new Map(questionAnswers(tool).map((answer) => [answer.questionId, answer.value]));
  const prompts = tool.questions ?? [];
  const waiting = tool.status === "running";

  if (waiting) return null;

  return (
    <section aria-label="Answered questions" className="min-w-0 py-1 text-sm leading-6">
      <p className="text-muted-foreground">{headline(tool, prompts.length)}</p>
      <dl className="mt-2 flex flex-col gap-3">
        {prompts.map((prompt) => (
          <div key={prompt.id} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground">{prompt.text}</dt>
            {answers.has(prompt.id) && (
              <dd className="break-words">{answerShown(prompt, answers.get(prompt.id) ?? "")}</dd>
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}
