import { SECRET_TOOL_NAME } from "@aven/protocol/events";

import type { QuestionAnswer, RunSelection, SecretChoice, ToolPart } from "../types";
import { QuestionForm } from "./question-form";
import { SecretForm } from "./secret-form";

type Props = {
  tool: ToolPart;
  threadId: string;
  // Resolves to whether the answer was taken, like the composer's `onSubmit`.
  onSubmit: (
    answers: QuestionAnswer[],
    selection: RunSelection,
    secret?: SecretChoice,
  ) => boolean | Promise<boolean>;
};

// The form that takes the composer's place while the agent waits: a masked one for a request for a
// secret (decision 0047), else the question's own.
export function AnswerForm({ tool, threadId, onSubmit }: Props) {
  if (tool.name === SECRET_TOOL_NAME) {
    return <SecretForm tool={tool} threadId={threadId} onSubmit={onSubmit} />;
  }
  return <QuestionForm tool={tool} threadId={threadId} onSubmit={onSubmit} />;
}
