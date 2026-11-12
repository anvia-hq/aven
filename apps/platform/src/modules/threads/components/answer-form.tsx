import { SECRET_TOOL_NAME } from "@aven/protocol/events";

import type { QuestionAnswer, RunSelection, SecretChoice, ToolPart } from "../types";
import { QuestionForm } from "./question-form";
import { SecretForm } from "./secret-form";

type Props = {
  tool: ToolPart;
  threadId: string;
  onSubmit: (
    answers: QuestionAnswer[],
    selection: RunSelection,
    secret?: SecretChoice,
  ) => boolean | Promise<boolean>;
};

export function AnswerForm({ tool, threadId, onSubmit }: Props) {
  if (tool.name === SECRET_TOOL_NAME) {
    return <SecretForm tool={tool} threadId={threadId} onSubmit={onSubmit} />;
  }

  return <QuestionForm tool={tool} threadId={threadId} onSubmit={onSubmit} />;
}
