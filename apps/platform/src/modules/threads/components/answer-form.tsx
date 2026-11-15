import { SECRET_TOOL_NAME } from "@aven/protocol/events";
import type { AgentBackendKind } from "@aven/protocol/types";

import type { QuestionAnswer, RunSelection, SecretChoice, ToolPart } from "../types";
import { QuestionForm } from "./question-form";
import { SecretForm } from "./secret-form";

type Props = {
  tool: ToolPart;
  threadId: string;
  backend?: AgentBackendKind;
  onSubmit: (
    answers: QuestionAnswer[],
    selection: RunSelection,
    secret?: SecretChoice,
  ) => boolean | Promise<boolean>;
};

export function AnswerForm({ tool, threadId, backend, onSubmit }: Props) {
  if (tool.name === SECRET_TOOL_NAME) {
    return <SecretForm tool={tool} threadId={threadId} backend={backend} onSubmit={onSubmit} />;
  }

  return <QuestionForm tool={tool} threadId={threadId} backend={backend} onSubmit={onSubmit} />;
}
