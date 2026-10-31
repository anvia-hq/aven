import { CheckCircle, QuestionCircle } from "@mynaui/icons-react";

import { questionAnswers, SECRET_TOOL_NAME, type ToolPart } from "@aven/protocol/events";

function headline(tool: ToolPart, count: number, waiting: boolean) {
  if (tool.name === SECRET_TOOL_NAME) {
    return waiting ? "Waiting for a secret" : "A secret was asked for; you answered privately";
  }
  if (waiting) return "Waiting for your answer";
  return `You answered ${count === 1 ? "a question" : `${count} questions`}`;
}

// The agent's question in the conversation: what it asked, and what was answered or that it waits.
// Answering happens in the composer's place (`QuestionForm`), not here.
export function QuestionBlock({ tool }: { tool: ToolPart }) {
  const answers = new Map(questionAnswers(tool).map((answer) => [answer.questionId, answer.value]));
  const prompts = tool.questions ?? [];
  const waiting = tool.status === "running";
  const Icon = waiting ? QuestionCircle : CheckCircle;

  return (
    <section
      aria-label={waiting ? "Question waiting for an answer" : "Answered questions"}
      className="min-w-0 overflow-hidden rounded-xl border bg-card/50 text-sm"
    >
      <header className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
        <Icon className={waiting ? "size-4 shrink-0" : "size-4 shrink-0 text-success"} />
        {headline(tool, prompts.length, waiting)}
      </header>
      <ol className="divide-y">
        {prompts.map((prompt, index) => (
          <li key={prompt.id} className="flex gap-3 px-3 py-2.5">
            {prompts.length > 1 && (
              <span className="mt-0.5 w-4 shrink-0 text-xs text-muted-foreground tabular-nums">
                {index + 1}
              </span>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-xs text-muted-foreground">{prompt.text}</p>
              {answers.has(prompt.id) && (
                <p className="font-medium break-words">{answers.get(prompt.id)}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
