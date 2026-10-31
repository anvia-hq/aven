import {
  assertAgentInteractionResponse,
  parseAgentContinuation,
} from "@anvia/core/agent/interactions";
import { SECRET_TOOL_NAME } from "@aven/protocol/events";

import { ConflictError, describeError, UnprocessableError } from "../../errors";
import { variableName } from "../variables/schema";
import { variablesService, type Scope } from "../variables/service";

type Answer = { questionId: string; value: string };

type Input = {
  organizationId: string;
  userId: string;
  projectId: string;
  /** The thread's saved continuation, which says what the agent asked. */
  continuation: unknown;
  answers: Answer[];
  /** Whose variable each secret becomes: the project's or the person's own. */
  scope: "project" | "personal";
  /** The person would rather not give them. */
  skip?: boolean;
};

// The answers to the agent's request for a secret (decision 0047) become secret variables, and the
// agent is given a note in their place: the value reaches the model, the run's journal and the
// transcript nowhere. Any other question's answers are returned as they are.
export async function keepSecretAnswers(input: Input): Promise<Answer[]> {
  let saved;
  try {
    saved = parseAgentContinuation(input.continuation);
  } catch {
    throw new ConflictError("The agent's question can no longer be answered; send a new message");
  }
  const { interaction } = saved;
  if (interaction.type !== "tool-question" || interaction.toolName !== SECRET_TOOL_NAME) {
    return input.answers;
  }

  // The answers must be the questions' own before anything is stored, and the runtime that asked
  // is not trusted: each question names a variable the rules allow.
  try {
    assertAgentInteractionResponse(interaction, { type: "tool-question", answers: input.answers });
  } catch (error) {
    throw new UnprocessableError(describeError(error));
  }
  for (const { id } of interaction.questions) {
    if (!variableName.safeParse(id).success) {
      throw new UnprocessableError(`${id} cannot be a variable name`);
    }
  }
  if (input.skip) {
    return input.answers.map(({ questionId }) => ({ questionId, value: "not provided" }));
  }

  const scope: Scope =
    input.scope === "personal"
      ? { kind: "personal", organizationId: input.organizationId, userId: input.userId }
      : { kind: "project", organizationId: input.organizationId, projectId: input.projectId };
  for (const { questionId, value } of input.answers) {
    await variablesService.set(scope, questionId, { value, secret: true });
  }
  return input.answers.map(({ questionId }) => ({
    questionId,
    value: `stored as ${questionId}`,
  }));
}
