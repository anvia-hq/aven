import { QuestionCircle } from "@mynaui/icons-react";

import { questionAnswers, type ToolPart } from "@aven/protocol/events";

// The agent's question in the conversation: what it asked, and what was answered or that it waits.
// Answering happens in the composer's place (`QuestionForm`), not here.
export function QuestionBlock({ tool }: { tool: ToolPart }) {
  const answers = new Map(questionAnswers(tool).map((answer) => [answer.questionId, answer.value]));
  const waiting = tool.status === "running";

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border px-3 py-2 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <QuestionCircle className="size-4 shrink-0" />
        {waiting ? "Waiting for your answer" : "Asked you"}
      </div>
      {tool.questions?.map((prompt) => (
        <div key={prompt.id} className="flex flex-col gap-0.5">
          <p>{prompt.text}</p>
          {answers.has(prompt.id) && (
            <p className="text-muted-foreground">{answers.get(prompt.id)}</p>
          )}
        </div>
      ))}
    </div>
  );
}
